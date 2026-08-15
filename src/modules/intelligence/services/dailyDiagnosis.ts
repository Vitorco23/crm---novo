// ============================================================
// Sprint 2 — Diagnóstico modular por REGRAS (sem IA).
// Consome o fechamento diário da Sprint 1 sem alterar fórmulas,
// campos ou persistência. Todas as conclusões são determinísticas.
// ============================================================

import {
  blastsRates, callsRates, followupsRates, rate, totalMinutes,
  type DailyMetricsReport, type NumField,
} from "./dailyMetricsReport";

// ---- Avaliação geral ----
export type Rating = "critico" | "atencao" | "moderado" | "bom" | "excelente";

export const RATING_LABEL: Record<Rating, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  moderado: "Moderado",
  bom: "Bom",
  excelente: "Excelente",
};

/** Regra transparente: percentual da meta atingida. Sem IA. */
export function ratingFromGoal(pct: number | null): Rating | null {
  if (pct === null) return null;
  if (pct >= 120) return "excelente";
  if (pct >= 100) return "bom";
  if (pct >= 70) return "moderado";
  if (pct >= 40) return "atencao";
  return "critico";
}

export type Classification = "sem-dados" | "critico" | "atencao" | "esperado" | "destaque";

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  "sem-dados": "Sem dados",
  critico: "Crítico",
  atencao: "Atenção",
  esperado: "Dentro do esperado",
  destaque: "Destaque",
};

/** Faixas de referência operacional configuráveis (nunca verdade absoluta). */
export interface Reference { low: number; ok: number; high: number }

export const REFERENCES: Record<string, Reference> = {
  "calls.connection": { low: 10, ok: 20, high: 35 },
  "calls.decisionMaker": { low: 15, ok: 30, high: 50 },
  "calls.r1": { low: 10, ok: 20, high: 35 },
  "blasts.open": { low: 20, ok: 40, high: 60 },
  "blasts.decisionMaker": { low: 10, ok: 20, high: 35 },
  "blasts.meeting": { low: 15, ok: 30, high: 50 },
  "followups.decisionMaker": { low: 15, ok: 30, high: 50 },
  "followups.meeting": { low: 15, ok: 30, high: 50 },
};

export function classify(value: number | null, ref: Reference): Classification {
  if (value === null) return "sem-dados";
  if (value < ref.low) return "critico";
  if (value < ref.ok) return "atencao";
  if (value < ref.high) return "esperado";
  return "destaque";
}

export interface ChannelStep {
  key: string;
  channel: "Ligações" | "Disparos" | "Follow-ups";
  label: string;
  value: number | null;
  classification: Classification;
  reference: Reference;
  explanation: string;
  recommendation: string;
}

const EXPLAIN: Record<string, [string, string]> = {
  "calls.connection": [
    "Mede quantas ligações viraram conversa real.",
    "Revise horários e a qualidade da lista discada.",
  ],
  "calls.decisionMaker": [
    "Mede quantas conversas chegaram ao decisor.",
    "Ajuste a abordagem com o gatekeeper e peça o nome do decisor.",
  ],
  "calls.r1": [
    "Mede quantos decisores aceitaram a R1.",
    "Trabalhe o convite da R1 com data e hora sugeridas.",
  ],
  "blasts.open": [
    "Mede o alcance das mensagens enviadas.",
    "Teste outra abertura e outro horário de envio.",
  ],
  "blasts.decisionMaker": [
    "Mede quantas aberturas chegaram ao decisor.",
    "Direcione a mensagem ao nome do decisor sempre que possível.",
  ],
  "blasts.meeting": [
    "Mede quantos decisores do canal aceitaram reunião.",
    "Inclua uma proposta de horário objetiva na mensagem.",
  ],
  "followups.decisionMaker": [
    "Mede o retorno dos follow-ups enviados.",
    "Reduza o intervalo entre tentativas e varie o canal.",
  ],
  "followups.meeting": [
    "Mede a conversão de retomadas em reunião.",
    "Retome com contexto da conversa anterior e um convite direto.",
  ],
};

function step(
  key: string,
  channel: ChannelStep["channel"],
  label: string,
  value: number | null,
): ChannelStep {
  const reference = REFERENCES[key];
  const [explanation, recommendation] = EXPLAIN[key];
  const classification = classify(value, reference);
  return {
    key, channel, label, value, classification, reference,
    explanation: classification === "sem-dados" ? "Denominador não informado neste fechamento." : explanation,
    recommendation: classification === "sem-dados" ? "Preencha os dois campos da etapa para habilitar a leitura." : recommendation,
  };
}

export function buildChannelSteps(r: DailyMetricsReport): ChannelStep[] {
  const c = callsRates(r.calls);
  const b = blastsRates(r.blasts);
  const f = followupsRates(r.followups);
  return [
    step("calls.connection", "Ligações", "Ligação → Conexão", c.connection),
    step("calls.decisionMaker", "Ligações", "Conexão → Decisor", c.decisionMaker),
    step("calls.r1", "Ligações", "Decisor → R1", c.r1),
    step("blasts.open", "Disparos", "Envio → Abertura", b.open),
    step("blasts.decisionMaker", "Disparos", "Abertura → Decisor", b.decisionMaker),
    step("blasts.meeting", "Disparos", "Decisor → Reunião", b.meeting),
    step("followups.decisionMaker", "Follow-ups", "Follow-up → Decisor", f.decisionMaker),
    step("followups.meeting", "Follow-ups", "Decisor → Reunião", f.meeting),
  ];
}

// ---- Oportunidades não convertidas ----
export interface OpportunityRow {
  channel: string;
  decisionMakers: number | null;
  converted: number | null;
  gap: number | null;
  note: string;
}

const gapOf = (dm: NumField, conv: NumField): number | null =>
  dm === null ? null : Math.max(0, dm - (conv ?? 0));

export function buildOpportunities(r: DailyMetricsReport): OpportunityRow[] {
  const rows: Array<[string, NumField, NumField]> = [
    ["Ligações", r.calls.decisionMakers, r.calls.r1],
    ["Disparos", r.blasts.decisionMakers, r.blasts.meetings],
    ["Follow-ups", r.followups.decisionMakers, r.followups.meetings],
  ];
  return rows
    .filter(([, dm]) => dm !== null && dm > 0)
    .map(([channel, dm, conv]) => {
      const gap = gapOf(dm, conv);
      return {
        channel,
        decisionMakers: dm,
        converted: conv ?? 0,
        gap,
        note: gap && gap > 0
          ? `${gap} decisores ainda não avançaram para reunião/R1 e podem ser priorizados no próximo acompanhamento.`
          : "Todos os decisores registrados avançaram para reunião/R1 neste fechamento.",
      };
    });
}

// ---- Eficiência por tempo ----
export interface EfficiencyRow { label: string; value: number | null }

const perHour = (n: NumField, minutes: number | null): number | null => {
  if (minutes === null || minutes <= 0 || n === null) return null;
  return Math.round((n / (minutes / 60)) * 10) / 10;
};

export function buildEfficiency(r: DailyMetricsReport): EfficiencyRow[] {
  const minutes = totalMinutes(r.general);
  const meetings =
    r.calls.r1 === null && r.blasts.meetings === null && r.followups.meetings === null
      ? null
      : (r.calls.r1 ?? 0) + (r.blasts.meetings ?? 0) + (r.followups.meetings ?? 0);
  return [
    { label: "Ligações por hora", value: perHour(r.calls.calls, minutes) },
    { label: "Conexões por hora", value: perHour(r.calls.connections, minutes) },
    { label: "Decisores por hora", value: perHour(r.calls.decisionMakers, minutes) },
    { label: "R1 / reuniões por hora", value: perHour(meetings, minutes) },
  ];
}

// ---- O que funcionou ----
export function buildWhatWorked(
  r: DailyMetricsReport,
  steps: ChannelStep[],
  goalPct: number | null,
  history: DailyMetricsReport[],
): string[] {
  const out: string[] = [];
  const best = steps
    .filter((s) => s.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number))[0];
  if (best) out.push(`Melhor conversão registrada: ${best.channel} — ${best.label} em ${best.value}%.`);
  if (goalPct !== null && goalPct >= 100) out.push(`Meta de reuniões atingida (${Math.round(goalPct)}% da meta).`);
  if (r.context.bestHour.trim()) out.push(`Melhor horário informado no fechamento: ${r.context.bestHour.trim()}.`);
  if (out.length < 3) {
    const minutes = totalMinutes(r.general);
    const today = perHour(r.calls.calls, minutes);
    const past = history
      .filter((h) => h.date !== r.date)
      .map((h) => perHour(h.calls.calls, totalMinutes(h.general)))
      .filter((v): v is number => v !== null);
    if (today !== null && past.length > 0) {
      const avg = past.reduce((a, v) => a + v, 0) / past.length;
      if (today > avg) out.push(`Ligações por hora acima do próprio histórico (${today} vs ${Math.round(avg * 10) / 10}).`);
    }
  }
  if (r.context.learning.trim()) out.push(`Aprendizado registrado: ${r.context.learning.trim()}`);
  return out.slice(0, 3);
}

// ---- Prioridades de correção ----
export type Impact = "alto" | "medio" | "baixo";
export const IMPACT_LABEL: Record<Impact, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo" };

export interface PriorityCard {
  stage: string;
  channel: string;
  impact: Impact;
  value: number | null;
  deltaToReference: number;
  explanation: string;
  action: string;
}

const IMPACT_ORDER: Record<Classification, number> = {
  critico: 0, atencao: 1, esperado: 2, destaque: 3, "sem-dados": 4,
};

/** Até 3 prioridades, ordenadas por severidade e distância da referência. */
export function buildPriorities(steps: ChannelStep[]): PriorityCard[] {
  return steps
    .filter((s) => s.classification === "critico" || s.classification === "atencao")
    .map((s) => {
      const delta = Math.round(((s.value ?? 0) - s.reference.ok) * 10) / 10;
      const impact: Impact = s.classification === "critico" ? "alto" : delta < -5 ? "medio" : "baixo";
      return {
        stage: s.label,
        channel: s.channel,
        impact,
        value: s.value,
        deltaToReference: delta,
        explanation: s.explanation,
        action: s.recommendation,
      };
    })
    .sort((a, b) => {
      const sev = IMPACT_ORDER[a.impact === "alto" ? "critico" : "atencao"] - IMPACT_ORDER[b.impact === "alto" ? "critico" : "atencao"];
      return sev !== 0 ? sev : a.deltaToReference - b.deltaToReference;
    })
    .slice(0, 3);
}

// ---- Plano do próximo dia ----
export interface PlanAction {
  id: string;
  title: string;
  reason: string;
  expected: string;
  suggestedTime?: string;
}

/** Exatamente três ações, sempre. */
export function buildNextDayPlan(
  r: DailyMetricsReport,
  priorities: PriorityCard[],
  opportunities: OpportunityRow[],
): PlanAction[] {
  const actions: PlanAction[] = [];
  const hour = r.context.bestHour.trim() || undefined;

  priorities.forEach((p, i) => {
    actions.push({
      id: `prio-${i}`,
      title: `Corrigir ${p.stage} (${p.channel})`,
      reason: `Etapa classificada como ${p.impact === "alto" ? "crítica" : "de atenção"} no fechamento de hoje.`,
      expected: "Repetir a etapa amanhã com volume igual ou maior e registrar a taxa resultante.",
      suggestedTime: i === 0 ? hour : undefined,
    });
  });

  const retake = opportunities.find((o) => (o.gap ?? 0) > 0);
  if (retake && actions.length < 3) {
    actions.push({
      id: "retake",
      title: `Retomar ${retake.gap} decisores de ${retake.channel}`,
      reason: "Decisores registrados que ainda não avançaram para reunião/R1.",
      expected: "Realizar o contato de retomada com cada decisor listado.",
      suggestedTime: hour,
    });
  }

  const fillers: PlanAction[] = [
    {
      id: "volume",
      title: "Manter o bloco de prospecção do dia",
      reason: "Volume constante é a base de comparação entre fechamentos.",
      expected: "Executar o mesmo tempo prospectando registrado hoje.",
      suggestedTime: hour,
    },
    {
      id: "objection",
      title: r.context.objection.trim()
        ? `Preparar resposta para a objeção "${r.context.objection.trim()}"`
        : "Registrar a principal objeção do dia",
      reason: "Objeção informada no contexto do fechamento.",
      expected: "Usar a resposta preparada nas próximas conversas com decisor.",
    },
    {
      id: "closing",
      title: "Fazer o fechamento de métricas ao fim do dia",
      reason: "Sem fechamento não há base de comparação para o diagnóstico.",
      expected: "Registrar os três canais e salvar o fechamento.",
    },
  ];
  for (const f of fillers) {
    if (actions.length >= 3) break;
    actions.push(f);
  }
  return actions.slice(0, 3);
}

// ---- Diagnóstico consolidado ----
export interface DailyDiagnosis {
  summary: string;
  rating: Rating | null;
  goalPct: number | null;
  meetings: number;
  goal: NumField;
  comparison: string | null;
  steps: ChannelStep[];
  opportunities: OpportunityRow[];
  efficiency: EfficiencyRow[];
  whatWorked: string[];
  priorities: PriorityCard[];
  plan: PlanAction[];
}

function meetingsOf(r: DailyMetricsReport): number {
  return (r.calls.r1 ?? 0) + (r.blasts.meetings ?? 0) + (r.followups.meetings ?? 0);
}

/** Fechamento anterior comparável: mesma data anterior com meta e reuniões registradas. */
function previousComparable(r: DailyMetricsReport, history: DailyMetricsReport[]): DailyMetricsReport | null {
  return history.find((h) => h.date < r.date && meetingsOf(h) > 0) ?? null;
}

export function buildDiagnosis(r: DailyMetricsReport, history: DailyMetricsReport[] = []): DailyDiagnosis {
  const meetings = meetingsOf(r);
  const goalPct = rate(meetings, r.general.meetingsGoal);
  const rating = ratingFromGoal(goalPct);
  const steps = buildChannelSteps(r);
  const opportunities = buildOpportunities(r);
  const priorities = buildPriorities(steps);

  const prev = previousComparable(r, history);
  const comparison = prev
    ? (() => {
        const before = meetingsOf(prev);
        const diff = meetings - before;
        const dir = diff > 0 ? "acima" : diff < 0 ? "abaixo" : "igual";
        return `${meetings} reunião(ões)/R1 — ${dir} do fechamento de ${prev.date} (${before}).`;
      })()
    : null;

  const worst = priorities[0];
  const summary = [
    goalPct === null
      ? `${meetings} reunião(ões)/R1 registradas; meta não informada.`
      : `${meetings} de ${r.general.meetingsGoal} reuniões/R1 (${Math.round(goalPct)}% da meta).`,
    worst
      ? `Principal gargalo: ${worst.stage} em ${worst.channel}.`
      : "Nenhuma etapa abaixo da referência operacional.",
  ].join(" ");

  return {
    summary,
    rating,
    goalPct,
    meetings,
    goal: r.general.meetingsGoal,
    comparison,
    steps,
    opportunities,
    efficiency: buildEfficiency(r),
    whatWorked: buildWhatWorked(r, steps, goalPct, history),
    priorities,
    plan: buildNextDayPlan(r, priorities, opportunities),
  };
}
