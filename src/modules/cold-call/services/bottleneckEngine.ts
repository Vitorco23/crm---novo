// ============================================================
// Motor de Gargalos — análise automática do funil comercial.
// Não altera nenhum outro módulo: apenas lê dados existentes
// (leads, sessões, movimentos, reuniões, metas) e devolve um
// diagnóstico único e acionável.
// ============================================================
import {
  getLeads, getSessions, getMovementEvents, getMeetings,
  getGoalsSettings, type Lead, type PomodoroSession, type MovementEvent, type Meeting,
} from "@/shared/services/store";

// --------- Períodos ---------
export type PeriodKey =
  | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

export interface Period { start: Date; end: Date; key: PeriodKey; label: string }

export function resolveBottleneckPeriod(key: PeriodKey, custom?: { start: Date; end: Date }): Period {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (key) {
    case "today":     return { key, label: "Hoje", start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { key, label: "Ontem", start: startOfDay(y), end: endOfDay(y) };
    }
    case "last7": {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { key, label: "Últimos 7 dias", start: startOfDay(s), end: endOfDay(now) };
    }
    case "last30": {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { key, label: "Últimos 30 dias", start: startOfDay(s), end: endOfDay(now) };
    }
    case "thisMonth": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { key, label: "Este mês", start: s, end: endOfDay(now) };
    }
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { key, label: "Mês anterior", start: s, end: e };
    }
    case "custom":
      return {
        key, label: "Personalizado",
        start: custom ? startOfDay(custom.start) : startOfDay(now),
        end:   custom ? endOfDay(custom.end)     : endOfDay(now),
      };
  }
}

const inRange = (iso: string | undefined, p: Period) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= p.start.getTime() && t <= p.end.getTime();
};

// --------- Modelo ---------
export type StageKey =
  | "call_to_conn"
  | "conn_to_dm"
  | "dm_to_meet"
  | "meet_to_held"
  | "held_to_close";

export type Severity = "critico" | "alto" | "medio" | "controlado";

export interface StageMetric {
  key: StageKey;
  label: string;               // rótulo curto do gap ("Abordagem inicial", ...)
  from: string;                // nome da etapa de origem
  to: string;                  // nome da etapa de destino
  numerator: number;
  denominator: number;
  actualPct: number | null;    // % real (0-100) ou null se sem base
  targetPct: number;           // meta configurada
  gapPct: number;              // target - actual (0 se actual >= target)
  lostOpportunities: number;   // quantos "cairam" nesta etapa (denom - num)
  severity: Severity;
  confidence: "alta" | "media" | "baixa";
}

export interface DimensionInsight {
  dimension: "Cidade" | "Nicho" | "Campanha" | "Horário";
  value: string;
  actualPct: number;
  samples: number;
  vsGlobal: number; // diferença em pontos percentuais
}

export interface BottleneckImpact {
  additionalDealsPerMonth: number;
  additionalRevenuePerMonth: number;
  projectedDealsIfFixed: number;
  currentDealsProjected: number;
}

export interface Bottleneck {
  period: Period;
  main: StageMetric;
  allStages: StageMetric[];
  explanation: string;
  impact: BottleneckImpact | null;
  recommendations: string[];
  dimensions: DimensionInsight[];
  hasEnoughData: boolean;
  reasonNoData?: string;
}

// --------- Metas de "Documento de Guerra" e "Proposta" ----------
// Como não existem estas etapas no schema atual, quando um lead
// passa por Oportunidades e chega a "Ganho", contamos como fechado.
// "Reunião Realizada -> Ganho" cobre o gap "Fechamento" (meetingHeldToClose).

// --------- Análise ---------
export interface AnalyzeOptions {
  city?: string;
  niche?: string;
  campaign?: string;
}

function stageLabel(key: StageKey): { label: string; from: string; to: string } {
  switch (key) {
    case "call_to_conn": return { label: "Abordagem inicial", from: "Ligações",   to: "Conexões" };
    case "conn_to_dm":   return { label: "Qualificação",       from: "Conexões",   to: "Decisores" };
    case "dm_to_meet":   return { label: "Agendamento",        from: "Decisores",  to: "Reuniões Marcadas" };
    case "meet_to_held": return { label: "Presença",           from: "Reuniões Marcadas", to: "Reuniões Realizadas" };
    case "held_to_close":return { label: "Fechamento",         from: "Reuniões Realizadas", to: "Vendas (Ganho)" };
  }
}

function classifySeverity(gap: number, actual: number | null, target: number): Severity {
  if (actual == null) return "medio";
  if (actual >= target) return "controlado";
  const ratio = actual / (target || 1);
  if (ratio < 0.5 || gap >= 15) return "critico";
  if (ratio < 0.75 || gap >= 10) return "alto";
  if (gap >= 5) return "medio";
  return "controlado";
}

function classifyConfidence(denominator: number): "alta" | "media" | "baixa" {
  if (denominator >= 30) return "alta";
  if (denominator >= 10) return "media";
  return "baixa";
}

function filterLeads(all: Lead[], opts: AnalyzeOptions): Lead[] {
  return all.filter((l) =>
    (!opts.city || l.city === opts.city) &&
    (!opts.niche || l.niche === opts.niche)
  );
}

function filterSessions(all: PomodoroSession[], opts: AnalyzeOptions): PomodoroSession[] {
  return all.filter((s) => !opts.niche || s.niche === opts.niche);
}

export function analyzeBottleneck(period: Period, opts: AnalyzeOptions = {}): Bottleneck {
  const goals = getGoalsSettings();
  const leads = filterLeads(getLeads(), opts);
  const leadIds = new Set(leads.map((l) => l.id));
  const sessions = filterSessions(getSessions(), opts).filter((s) => inRange(s.startTime, period));
  const movements = getMovementEvents().filter(
    (m) => inRange(m.timestamp, period) && (leadIds.size === 0 || leadIds.has(m.leadId))
  );
  const meetings = getMeetings().filter((m) => {
    const iso = `${m.date}T${m.time || "00:00"}`;
    return inRange(iso, period) && (leadIds.size === 0 || leadIds.has(m.leadId));
  });

  // Agregações do funil
  const calls        = sessions.reduce((a, s) => a + (s.calls || 0), 0);
  const connections  = sessions.reduce((a, s) => a + (s.connections || 0), 0);
  const dms          = sessions.reduce((a, s) => a + (s.decisionMakers || 0), 0);
  // Reuniões marcadas no período: agenda oficial + registro rápido em sessão
  const meetingsScheduled = Math.max(
    meetings.filter((m) => (m.source || "Ligação") === "Ligação").length,
    sessions.reduce((a, s) => a + (s.meetings || 0), 0)
  );
  const meetingsHeld = movements.filter((m) => /reuni[aã]o realizada/i.test(m.toStage)).length;
  const closes       = movements.filter((m) => /ganho/i.test(m.toStage)).length;

  const build = (key: StageKey, num: number, den: number, targetPct: number): StageMetric => {
    const actualPct = den > 0 ? Math.round((num / den) * 1000) / 10 : null;
    const gapPct = actualPct == null ? 0 : Math.max(0, targetPct - actualPct);
    const meta = stageLabel(key);
    return {
      key,
      label: meta.label,
      from: meta.from,
      to: meta.to,
      numerator: num,
      denominator: den,
      actualPct,
      targetPct,
      gapPct: Math.round(gapPct * 10) / 10,
      lostOpportunities: Math.max(0, den - num),
      severity: classifySeverity(gapPct, actualPct, targetPct),
      confidence: classifyConfidence(den),
    };
  };

  const allStages: StageMetric[] = [
    build("call_to_conn",  connections,      calls,       goals.callToConnection),
    build("conn_to_dm",    dms,              connections, goals.connectionToDecisionMaker),
    build("dm_to_meet",    meetingsScheduled, dms,        goals.decisionMakerToMeetingScheduled),
    build("meet_to_held",  meetingsHeld,     meetingsScheduled, goals.meetingScheduledToHeld),
    build("held_to_close", closes,           meetingsHeld, goals.meetingHeldToClose),
  ];

  // Base estatística mínima: ao menos uma etapa com denom >= 5.
  const anyBase = allStages.some((s) => s.denominator >= 5);
  const hasEnoughData = anyBase && (calls + connections + dms) >= 10;

  // Escolhe o gargalo principal: severidade > confiança > gap absoluto > oportunidades perdidas.
  const severityRank: Record<Severity, number> = { critico: 4, alto: 3, medio: 2, controlado: 1 };
  const confidenceRank: Record<StageMetric["confidence"], number> = { alta: 3, media: 2, baixa: 1 };
  const rankable = allStages.filter((s) => s.actualPct != null && s.denominator > 0);
  const sorted = [...rankable].sort((a, b) => {
    const s = severityRank[b.severity] - severityRank[a.severity]; if (s !== 0) return s;
    const c = confidenceRank[b.confidence] - confidenceRank[a.confidence]; if (c !== 0) return c;
    if (b.gapPct !== a.gapPct) return b.gapPct - a.gapPct;
    return b.lostOpportunities - a.lostOpportunities;
  });
  const main = sorted[0] || allStages[0];

  const explanation = buildExplanation(main);
  const impact = hasEnoughData ? projectImpact(main, allStages, goals.averageTicket, period) : null;
  const recommendations = buildRecommendations(main);
  const dimensions = hasEnoughData
    ? computeDimensionInsights(main, period, opts)
    : [];

  return {
    period,
    main,
    allStages,
    explanation,
    impact,
    recommendations,
    dimensions,
    hasEnoughData,
    reasonNoData: hasEnoughData
      ? undefined
      : "Ainda não existem dados suficientes para identificar um gargalo confiável.",
  };
}

function buildExplanation(m: StageMetric): string {
  if (m.actualPct == null) {
    return `Ainda não há registros suficientes entre ${m.from} e ${m.to} no período selecionado.`;
  }
  const pct = m.actualPct.toFixed(1).replace(".", ",");
  const meta = m.targetPct.toString().replace(".", ",");
  return `O maior gargalo atual está entre ${m.from} e ${m.to}. ` +
    `Apenas ${pct}% avançaram para ${m.to}, enquanto sua meta é de ${meta}%. ` +
    `${m.lostOpportunities} oportunidade(s) foram perdidas nesta etapa no período.`;
}

function projectImpact(
  main: StageMetric, allStages: StageMetric[], averageTicket: number, period: Period
): BottleneckImpact {
  // Reconstroi funil substituindo a etapa gargalo pela taxa da meta.
  // Base: ligações reais do período (denominador da 1ª etapa).
  const top = allStages[0].denominator;
  const rateOf = (s: StageMetric, replace: boolean) => {
    const t = replace ? s.targetPct : (s.actualPct ?? 0);
    return Math.max(0, Math.min(100, t)) / 100;
  };

  const projected = (replaceKey: StageKey | null) => {
    let v = top;
    for (const s of allStages) v = v * rateOf(s, replaceKey === s.key);
    return v;
  };

  const currentDeals = projected(null);
  const fixedDeals   = projected(main.key);

  // Normaliza para "mensal" segundo o span do período.
  const days = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1);
  const factor = 30 / days;

  const additional = Math.max(0, fixedDeals - currentDeals);
  return {
    currentDealsProjected:   Math.round(currentDeals * factor * 10) / 10,
    projectedDealsIfFixed:   Math.round(fixedDeals   * factor * 10) / 10,
    additionalDealsPerMonth: Math.round(additional  * factor * 10) / 10,
    additionalRevenuePerMonth: Math.round(additional * factor * averageTicket),
  };
}

const RECOMMENDATIONS: Record<StageKey, string[]> = {
  call_to_conn: [
    "Revisar o script de abertura — as 15 primeiras palavras decidem a conexão.",
    "Testar novos horários de prospecção (fora do horário de pico do decisor).",
    "Validar qualidade da base: cidade, nicho e canal — leads frios derrubam a conexão.",
    "Aumentar volume de tentativas por lead antes de descartar.",
  ],
  conn_to_dm: [
    "Melhorar a pergunta de qualificação inicial para identificar o decisor mais cedo.",
    "Confirmar cargo/decisor via LinkedIn ou Instagram antes de ligar.",
    "Ajustar abordagem para não ser filtrado por gatekeeper.",
    "Registrar objeções mais comuns e treinar respostas objetivas.",
  ],
  dm_to_meet: [
    "Revisar a oferta da reunião — está clara a promessa de valor em 20 segundos?",
    "Propor 2 horários específicos ao invés de 'qual seu melhor dia'.",
    "Usar prova social (case, número) antes de pedir a reunião.",
    "Enviar convite/link imediatamente após a ligação, ainda no telefone.",
  ],
  meet_to_held: [
    "Enviar confirmação 24h e 1h antes da reunião (WhatsApp + e-mail).",
    "Garantir link do Google Meet no convite e no lembrete.",
    "Ligar 10 minutos antes se o lead não entrar na sala.",
    "Revisar critério de agendamento — reuniões marcadas 'no impulso' não comparecem.",
  ],
  held_to_close: [
    "Aprofundar o diagnóstico comercial com SPIN — dor, impacto, valor.",
    "Estruturar o Documento de Guerra e apresentar antes da proposta.",
    "Treinar objeções de fechamento (preço, tempo, autoridade).",
    "Implementar follow-up com prazo definido — proposta sem prazo perde força.",
  ],
};

function buildRecommendations(m: StageMetric): string[] {
  return RECOMMENDATIONS[m.key].slice(0, 4);
}

// --------- Insights por dimensão ---------
function computeDimensionInsights(main: StageMetric, period: Period, opts: AnalyzeOptions): DimensionInsight[] {
  const insights: DimensionInsight[] = [];
  const sessions = getSessions().filter((s) => inRange(s.startTime, period));
  if (sessions.length === 0) return insights;

  // A dimensão útil por etapa varia. Para simplificar entregamos:
  //  - Nicho (todas as etapas de sessão)
  //  - Horário (todas as etapas de sessão)
  //  - Cidade (etapas ligadas a leads)
  const globalRate = main.actualPct ?? 0;

  const bucket = new Map<string, { num: number; den: number; samples: number }>();

  const inc = (k: string, num: number, den: number) => {
    if (!k) return;
    const cur = bucket.get(k) || { num: 0, den: 0, samples: 0 };
    cur.num += num; cur.den += den; cur.samples += 1;
    bucket.set(k, cur);
  };

  const topOfBucket = (dim: DimensionInsight["dimension"]) => {
    const arr: DimensionInsight[] = [];
    bucket.forEach((v, k) => {
      if (v.den < 5) return;
      const rate = Math.round((v.num / v.den) * 1000) / 10;
      arr.push({ dimension: dim, value: k, actualPct: rate, samples: v.den, vsGlobal: Math.round((rate - globalRate) * 10) / 10 });
    });
    arr.sort((a, b) => Math.abs(b.vsGlobal) - Math.abs(a.vsGlobal));
    return arr.slice(0, 2);
  };

  const num = (s: PomodoroSession) => {
    switch (main.key) {
      case "call_to_conn":  return s.connections || 0;
      case "conn_to_dm":    return s.decisionMakers || 0;
      case "dm_to_meet":    return s.meetings || 0;
      default:              return s.meetings || 0;
    }
  };
  const den = (s: PomodoroSession) => {
    switch (main.key) {
      case "call_to_conn":  return s.calls || 0;
      case "conn_to_dm":    return s.connections || 0;
      case "dm_to_meet":    return s.decisionMakers || 0;
      default:              return s.calls || 0;
    }
  };

  // Nicho
  if (!opts.niche) {
    bucket.clear();
    sessions.forEach((s) => inc(s.niche || "—", num(s), den(s)));
    insights.push(...topOfBucket("Nicho"));
  }

  // Horário (janela de 2h)
  bucket.clear();
  sessions.forEach((s) => {
    const h = new Date(s.startTime).getHours();
    const slot = `${String(Math.floor(h / 2) * 2).padStart(2, "0")}h–${String(Math.floor(h / 2) * 2 + 2).padStart(2, "0")}h`;
    inc(slot, num(s), den(s));
  });
  insights.push(...topOfBucket("Horário"));

  // Cidade (via leads movidos no período — aproximação)
  if (!opts.city) {
    const moves = getMovementEvents().filter((m) => inRange(m.timestamp, period));
    const leadMap = new Map(getLeads().map((l) => [l.id, l]));
    bucket.clear();
    moves.forEach((mv) => {
      const l = leadMap.get(mv.leadId); if (!l?.city) return;
      const isNum =
        (main.key === "meet_to_held" && /reuni[aã]o realizada/i.test(mv.toStage)) ||
        (main.key === "held_to_close" && /ganho/i.test(mv.toStage));
      const isDen = false; // denom vem de sessions; usamos só a distribuição dos ganhos como sinal
      if (isNum) inc(l.city, 1, 1);
      else if (isDen) inc(l.city, 0, 1);
    });
    // Para cidade só faz sentido em etapas ligadas a movimentos de lead.
    if (main.key === "meet_to_held" || main.key === "held_to_close") {
      insights.push(...topOfBucket("Cidade"));
    }
  }

  return insights.slice(0, 4);
}

// --------- Snapshot para histórico e comparação ---------
export interface BottleneckSnapshot {
  timestamp: string;
  periodKey: PeriodKey;
  periodLabel: string;
  stageKey: StageKey;
  stageLabel: string;
  from: string;
  to: string;
  actualPct: number | null;
  targetPct: number;
  gapPct: number;
  severity: Severity;
  hasEnoughData: boolean;
}

export function toSnapshot(b: Bottleneck): BottleneckSnapshot {
  return {
    timestamp: new Date().toISOString(),
    periodKey: b.period.key,
    periodLabel: b.period.label,
    stageKey: b.main.key,
    stageLabel: b.main.label,
    from: b.main.from,
    to: b.main.to,
    actualPct: b.main.actualPct,
    targetPct: b.main.targetPct,
    gapPct: b.main.gapPct,
    severity: b.main.severity,
    hasEnoughData: b.hasEnoughData,
  };
}

export function compareBottlenecks(current: Bottleneck, previous: Bottleneck): string | null {
  if (!current.hasEnoughData || !previous.hasEnoughData) return null;
  if (current.main.key !== previous.main.key) {
    return `O gargalo deixou de ser "${previous.main.label}" e passou a ser "${current.main.label}".`;
  }
  const a = current.main.actualPct ?? 0;
  const b = previous.main.actualPct ?? 0;
  const diff = Math.round((a - b) * 10) / 10;
  if (Math.abs(diff) < 1) return `A conversão de "${current.main.label}" está estável em relação ao período anterior.`;
  const dir = diff > 0 ? "melhorou" : "piorou";
  return `A conversão entre ${current.main.from} e ${current.main.to} ${dir} ${Math.abs(diff)} pontos vs. período anterior.`;
}

// Período "anterior" equivalente ao selecionado (para comparação automática).
export function previousPeriod(p: Period): Period {
  const span = p.end.getTime() - p.start.getTime();
  const end = new Date(p.start.getTime() - 1);
  const start = new Date(end.getTime() - span);
  return { key: "custom", label: `Período anterior (${p.label})`, start, end };
}
