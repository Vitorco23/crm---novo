// Builders modulares por página. Novos módulos futuros só precisam
// implementar `build*Sheets(range)` retornando um array de SheetSpec.

import {
  getLeads, getSessions, getMovementEvents, getMeetings, getGoalsSettings,
  COLD_CALL_STAGES, OPORTUNIDADES_STAGES, ONBOARDING_STAGES,
  type Lead, type PomodoroSession, type MovementEvent, type Meeting,
} from "@/shared/services/store";
import { getTransactions, monthKey } from "@/modules/financeiro/services/finance";
import { getInsights, sortInsights, CATEGORY_LABELS, PRIORITY_LABELS } from "@/modules/intelligence/services/insights";
import { clean, titleCase, inRange, type DateRange, type SheetSpec } from "@/modules/pipeline/services/exportEngine";

// ---------- Utils compartilhados ----------
const norm = (s: string | undefined | null) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();

const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

const CAMPAIGN_SPLIT = /\s+[-–—]\s+/;
function parseNiche(n: string) {
  const raw = clean(n);
  if (!raw) return { niche: "" };
  if (CAMPAIGN_SPLIT.test(raw)) return { niche: raw.split(CAMPAIGN_SPLIT)[0].trim() };
  return { niche: raw };
}

interface DatasetInRange {
  range: DateRange;
  leads: Lead[]; // leads criados no período
  allLeads: Lead[]; // todos os leads (para pipeline snapshot)
  sessions: PomodoroSession[];
  events: MovementEvent[];
  meetings: Meeting[];
  totalCalls: number;
  totalConnections: number;
  totalDecisionMakers: number;
  totalMeetings: number;
}

function buildDataset(range: DateRange): DatasetInRange {
  const allLeads = getLeads();
  const leads = allLeads.filter((l) => inRange(range, l.createdAt));
  const sessions = getSessions().filter((s) => inRange(range, s.startTime));
  const events = getMovementEvents().filter((e) => inRange(range, e.timestamp));
  const meetings = getMeetings().filter((m) =>
    inRange(range, `${m.date}T${m.time || "00:00"}:00`)
  );
  const totalCalls = sessions.reduce((a, b) => a + (b.calls || 0), 0);
  const totalConnections = sessions.reduce((a, b) => a + (b.connections || 0), 0);
  const totalDecisionMakers = sessions.reduce((a, b) => a + (b.decisionMakers || 0), 0);
  const totalMeetings = sessions.reduce((a, b) => a + (b.meetings || 0), 0);
  return { range, leads, allLeads, sessions, events, meetings,
    totalCalls, totalConnections, totalDecisionMakers, totalMeetings };
}

const confidenceLabel = (calls: number) =>
  calls >= 100 ? "Alta" : calls >= 30 ? "Média" : "Baixa";

// ============================================================
// DASHBOARD
// ============================================================
export function buildDashboardSheets(range: DateRange): SheetSpec[] {
  const ds = buildDataset(range);
  const goals = getGoalsSettings();
  const tx = getTransactions();
  const mkStart = range.start.toISOString().slice(0, 7);
  const monthRevenue = tx.filter((t) =>
    t.kind === "revenue" && monthKey(t.date) >= mkStart &&
    monthKey(t.date) <= range.end.toISOString().slice(0, 7)
  ).reduce((a, b) => a + b.amount, 0);

  const wins = ds.allLeads.filter((l) =>
    (ONBOARDING_STAGES as readonly string[]).includes(l.stage) &&
    inRange(range, l.stageChangedAt)
  );

  // Pomodoros — tempo produtivo
  const productiveMinutes = ds.sessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);

  const indicadores: SheetSpec = {
    name: "Indicadores",
    columns: [
      { header: "Indicador", key: "ind", type: "text", width: 34 },
      { header: "Valor", key: "val", type: "decimal", width: 18 },
      { header: "Formato", key: "fmt", type: "text", width: 14 },
    ],
    rows: [
      { ind: "Ligações Totais", val: ds.totalCalls, fmt: "Quantidade" },
      { ind: "Conexões", val: ds.totalConnections, fmt: "Quantidade" },
      { ind: "Decisores", val: ds.totalDecisionMakers, fmt: "Quantidade" },
      { ind: "Reuniões Marcadas", val: ds.totalMeetings, fmt: "Quantidade" },
      { ind: "Pomodoros Executados", val: ds.sessions.length, fmt: "Quantidade" },
      { ind: "Tempo Produtivo (min)", val: productiveMinutes, fmt: "Minutos" },
      { ind: "Vendas Fechadas no Período", val: wins.length, fmt: "Quantidade" },
      { ind: "Receita do Mês Corrente", val: monthRevenue, fmt: "Real (R$)" },
      { ind: "Meta Mensal", val: goals.monthlyRevenueGoal, fmt: "Real (R$)" },
      { ind: "Percentual da Meta", val: rate(monthRevenue, goals.monthlyRevenueGoal), fmt: "Percentual" },
      { ind: "Taxa de Conexão", val: rate(ds.totalConnections, ds.totalCalls), fmt: "Percentual" },
      { ind: "Taxa de Decisores", val: rate(ds.totalDecisionMakers, ds.totalConnections), fmt: "Percentual" },
      { ind: "Taxa de Reuniões", val: rate(ds.totalMeetings, ds.totalCalls), fmt: "Percentual" },
    ],
  };
  // Ajusta tipo do valor por linha
  indicadores.columns = [
    { header: "Indicador", key: "ind", type: "text", width: 34 },
    { header: "Valor", key: "val", type: "text", width: 20 },
    { header: "Formato", key: "fmt", type: "text", width: 16 },
  ];
  indicadores.rows = indicadores.rows.map((r) => {
    const v = r.val as number;
    if (r.fmt === "Percentual") return { ...r, val: `${(v * 100).toFixed(1)}%` };
    if (r.fmt === "Real (R$)") return { ...r, val: v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) };
    return { ...r, val: (v || 0).toLocaleString("pt-BR") };
  });

  const pomodoros: SheetSpec = {
    name: "Pomodoros",
    columns: [
      { header: "Início", key: "start", type: "datetime" },
      { header: "Fim", key: "end", type: "datetime" },
      { header: "Duração (min)", key: "duration", type: "int" },
      { header: "Ligações", key: "calls", type: "int" },
      { header: "Conexões", key: "conn", type: "int" },
      { header: "Decisores", key: "dm", type: "int" },
      { header: "Reuniões", key: "meet", type: "int" },
      { header: "Nicho", key: "niche", type: "text" },
      { header: "Script Utilizado", key: "script", type: "text" },
    ],
    rows: ds.sessions.map((s) => ({
      start: new Date(s.startTime),
      end: new Date(s.endTime),
      duration: s.durationMinutes,
      calls: s.calls || 0,
      conn: s.connections || 0,
      dm: s.decisionMakers || 0,
      meet: s.meetings || 0,
      niche: titleCase(s.niche),
      script: clean((s as any).scriptUsed || ""),
    })),
  };

  const reunioes: SheetSpec = {
    name: "Reuniões",
    columns: [
      { header: "Data", key: "date", type: "date" },
      { header: "Horário", key: "time", type: "text", width: 10 },
      { header: "Empresa", key: "company", type: "text" },
      { header: "Contato", key: "contact", type: "text" },
      { header: "Canal", key: "channel", type: "text" },
      { header: "Origem da Reunião", key: "source", type: "text" },
      { header: "Título", key: "title", type: "text" },
      { header: "Link", key: "link", type: "text" },
    ],
    rows: ds.meetings.map((m) => ({
      date: new Date(`${m.date}T00:00:00`),
      time: m.time,
      company: titleCase(m.company),
      contact: titleCase(m.contactName),
      channel: m.channel,
      source: m.source,
      title: m.title,
      link: m.link || m.meetLink || "",
    })),
  };

  const receita: SheetSpec = {
    name: "Receita",
    columns: [
      { header: "Data", key: "date", type: "date" },
      { header: "Descrição", key: "desc", type: "text" },
      { header: "Cliente", key: "client", type: "text" },
      { header: "Tipo de Serviço", key: "service", type: "text" },
      { header: "Origem", key: "src", type: "text" },
      { header: "Valor (R$)", key: "value", type: "currency" },
    ],
    rows: tx.filter((t) => t.kind === "revenue" && inRange(range, `${t.date}T00:00:00`))
      .map((t) => ({
        date: new Date(`${t.date}T00:00:00`),
        desc: t.description,
        client: titleCase(t.clientName),
        service: t.serviceType,
        src: t.source === "auto_onboarding" ? "Onboarding (Auto)" : "Manual",
        value: t.amount,
      })),
  };

  return [indicadores, pomodoros, reunioes, receita];
}

// ============================================================
// METAS
// ============================================================
export function buildMetasSheets(range: DateRange): SheetSpec[] {
  const goals = getGoalsSettings();
  const ds = buildDataset(range);
  const tx = getTransactions();
  const mkNow = new Date().toISOString().slice(0, 7);
  const monthRevenue = tx.filter((t) => t.kind === "revenue" && monthKey(t.date) === mkNow)
    .reduce((a, b) => a + b.amount, 0);

  const totalMeetingsAll = getMeetings().filter((m) =>
    monthKey(m.date) === mkNow
  ).length;

  const configuracoes: SheetSpec = {
    name: "Configuração das Metas",
    columns: [
      { header: "Meta", key: "name", type: "text", width: 36 },
      { header: "Valor Configurado", key: "value", type: "text", width: 22 },
      { header: "Unidade", key: "unit", type: "text", width: 18 },
    ],
    rows: [
      { name: "Meta Mensal de Receita", value: goals.monthlyRevenueGoal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), unit: "Reais" },
      { name: "Ticket Médio", value: goals.averageTicket.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), unit: "Reais" },
      { name: "Taxa Ligação → Conexão", value: `${goals.callToConnection}%`, unit: "Percentual" },
      { name: "Taxa Conexão → Decisor", value: `${goals.connectionToDecisionMaker}%`, unit: "Percentual" },
      { name: "Taxa Decisor → Reunião Agendada", value: `${goals.decisionMakerToMeetingScheduled}%`, unit: "Percentual" },
      { name: "Taxa Reunião Agendada → Realizada", value: `${goals.meetingScheduledToHeld}%`, unit: "Percentual" },
      { name: "Taxa Reunião Realizada → Fechamento", value: `${goals.meetingHeldToClose}%`, unit: "Percentual" },
      { name: "Dias Úteis por Semana", value: String(goals.workingDaysPerWeek), unit: "Dias" },
      { name: "Horas Trabalhadas por Dia", value: String(goals.hoursPerDay), unit: "Horas" },
      { name: "Minutos por Ligação", value: String(goals.minutesPerCall), unit: "Minutos" },
    ],
  };

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const daysRemaining = daysInMonth - daysPassed;
  const pct = rate(monthRevenue, goals.monthlyRevenueGoal);
  const status = pct >= 1 ? "Meta atingida" : pct >= 0.9 ? "Próxima da meta" : pct >= (daysPassed / daysInMonth) ? "No ritmo" : "Em risco";

  const progresso: SheetSpec = {
    name: "Progresso",
    columns: [
      { header: "Meta", key: "name", type: "text", width: 36 },
      { header: "Valor Meta", key: "goal", type: "currency" },
      { header: "Valor Realizado", key: "done", type: "currency" },
      { header: "Percentual", key: "pct", type: "percent" },
      { header: "Status", key: "status", type: "text" },
      { header: "Data de Criação", key: "created", type: "date" },
      { header: "Data Limite", key: "deadline", type: "date" },
      { header: "Dias Restantes", key: "remaining", type: "int" },
    ],
    rows: [{
      name: "Meta Mensal de Receita",
      goal: goals.monthlyRevenueGoal,
      done: monthRevenue,
      pct,
      status,
      created: new Date(now.getFullYear(), now.getMonth(), 1),
      deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      remaining: daysRemaining,
    }],
  };

  const progressoHoje: SheetSpec = {
    name: "Progresso do Período",
    columns: [
      { header: "Métrica", key: "m", type: "text", width: 32 },
      { header: "Realizado", key: "done", type: "int" },
      { header: "Meta Diária Estimada", key: "target", type: "int" },
      { header: "Percentual", key: "pct", type: "percent" },
    ],
    rows: (() => {
      const workingWeeks = 4;
      const dailyCalls = Math.round((goals.hoursPerDay * 60) / (goals.minutesPerCall || 1));
      const dailyDMs = Math.round(dailyCalls * (goals.callToConnection / 100) * (goals.connectionToDecisionMaker / 100));
      const dailyMeetings = Math.round(dailyDMs * (goals.decisionMakerToMeetingScheduled / 100));
      void workingWeeks;
      return [
        { m: "Ligações no Período", done: ds.totalCalls, target: dailyCalls, pct: rate(ds.totalCalls, dailyCalls) },
        { m: "Conexões no Período", done: ds.totalConnections, target: Math.round(dailyCalls * goals.callToConnection / 100), pct: rate(ds.totalConnections, dailyCalls * goals.callToConnection / 100) },
        { m: "Decisores no Período", done: ds.totalDecisionMakers, target: dailyDMs, pct: rate(ds.totalDecisionMakers, dailyDMs) },
        { m: "Reuniões no Período", done: ds.totalMeetings, target: dailyMeetings, pct: rate(ds.totalMeetings, dailyMeetings) },
      ];
    })(),
  };

  void totalMeetingsAll;
  return [configuracoes, progresso, progressoHoje];
}

// ============================================================
// INTELIGÊNCIA COMERCIAL
// ============================================================
function bucketRows<K extends string>(
  keyFn: (l: Lead) => { key: string; label: string } | null,
  ds: DatasetInRange,
  extras?: { includeSessionMetrics?: boolean }
) {
  const leadById = new Map(ds.allLeads.map((l) => [l.id, l]));
  const map = new Map<string, { key: string; label: string; leads: number; calls: number; connections: number; dm: number; meetings: number }>();
  const ensure = (k: string, label: string) => {
    if (!map.has(k)) map.set(k, { key: k, label, leads: 0, calls: 0, connections: 0, dm: 0, meetings: 0 });
    return map.get(k)!;
  };
  for (const l of ds.leads) {
    const g = keyFn(l); if (!g) continue;
    ensure(g.key, g.label).leads++;
  }
  for (const e of ds.events) {
    if (e.type !== "call") continue;
    const l = leadById.get(e.leadId); if (!l) continue;
    const g = keyFn(l); if (!g) continue;
    ensure(g.key, g.label).calls++;
  }
  for (const m of ds.meetings) {
    const l = leadById.get(m.leadId); if (!l) continue;
    const g = keyFn(l); if (!g) continue;
    ensure(g.key, g.label).meetings++;
  }
  if (extras?.includeSessionMetrics) {
    // conexões/decisores por nicho: buscamos via sessions.niche
    for (const s of ds.sessions) {
      const p = parseNiche(s.niche || "").niche; if (!p) continue;
      const key = norm(p);
      const row = ensure(key, p);
      row.connections += s.connections || 0;
      row.dm += s.decisionMakers || 0;
    }
  }
  void ((): K => "" as K);
  return [...map.values()];
}

export function buildInteligenciaSheets(range: DateRange): SheetSpec[] {
  const ds = buildDataset(range);

  const commonCols = (labelHeader: string) => [
    { header: labelHeader, key: "label", type: "text" as const, width: 30 },
    { header: "Leads", key: "leads", type: "int" as const },
    { header: "Ligações", key: "calls", type: "int" as const },
    { header: "Conexões", key: "connections", type: "int" as const },
    { header: "Quantidade de Decisores", key: "dm", type: "int" as const },
    { header: "Reuniões Marcadas", key: "meetings", type: "int" as const },
    { header: "Taxa de Conexão", key: "connRate", type: "percent" as const },
    { header: "Taxa de Decisores", key: "dmRate", type: "percent" as const },
    { header: "Taxa de Reuniões", key: "meetingRate", type: "percent" as const },
    { header: "Confiabilidade", key: "confidence", type: "text" as const, width: 16 },
    { header: "Ranking", key: "rank", type: "int" as const },
  ];

  const finalize = (rows: ReturnType<typeof bucketRows>) =>
    rows.map((r) => ({
      label: r.label,
      leads: r.leads, calls: r.calls, connections: r.connections, dm: r.dm, meetings: r.meetings,
      connRate: rate(r.connections, r.calls),
      dmRate: rate(r.dm, r.connections),
      meetingRate: rate(r.meetings, r.calls),
      confidence: confidenceLabel(r.calls),
    }))
      .sort((a, b) => b.meetingRate - a.meetingRate)
      .map((r, i) => ({ ...r, rank: i + 1 }));

  const cidades: SheetSpec = {
    name: "Cidades",
    columns: commonCols("Cidade"),
    rows: finalize(bucketRows((l) => l.city ? { key: norm(l.city), label: titleCase(l.city) } : null, ds)),
  };
  const nichos: SheetSpec = {
    name: "Nichos",
    columns: commonCols("Nicho"),
    rows: finalize(bucketRows((l) => {
      const n = parseNiche(l.niche).niche;
      return n ? { key: norm(n), label: titleCase(n) } : null;
    }, ds, { includeSessionMetrics: true })),
  };
  const campanhas: SheetSpec = {
    name: "Campanhas",
    columns: commonCols("Campanha"),
    rows: finalize(bucketRows((l) => {
      const n = parseNiche(l.niche).niche;
      if (!n || !l.city) return null;
      return { key: `${norm(n)}||${norm(l.city)}`, label: `${titleCase(n)} — ${titleCase(l.city)}` };
    }, ds)),
  };

  // Scripts
  const scriptMap = new Map<string, { calls: number; meetings: number; connections: number; dm: number }>();
  for (const s of ds.sessions) {
    const sc = clean((s as any).scriptUsed || ""); if (!sc) continue;
    const b = scriptMap.get(sc) || { calls: 0, meetings: 0, connections: 0, dm: 0 };
    b.calls += s.calls || 0; b.meetings += s.meetings || 0;
    b.connections += s.connections || 0; b.dm += s.decisionMakers || 0;
    scriptMap.set(sc, b);
  }
  const scripts: SheetSpec = {
    name: "Scripts",
    columns: [
      { header: "Script Utilizado", key: "label", type: "text", width: 24 },
      { header: "Ligações", key: "calls", type: "int" },
      { header: "Conexões", key: "connections", type: "int" },
      { header: "Quantidade de Decisores", key: "dm", type: "int" },
      { header: "Reuniões Marcadas", key: "meetings", type: "int" },
      { header: "Taxa de Conexão", key: "connRate", type: "percent" },
      { header: "Taxa de Reuniões", key: "meetingRate", type: "percent" },
      { header: "Confiabilidade", key: "confidence", type: "text" },
      { header: "Ranking", key: "rank", type: "int" },
    ],
    rows: [...scriptMap.entries()]
      .map(([label, v]) => ({
        label, ...v,
        connRate: rate(v.connections, v.calls),
        meetingRate: rate(v.meetings, v.calls),
        confidence: confidenceLabel(v.calls),
      }))
      .sort((a, b) => b.meetingRate - a.meetingRate)
      .map((r, i) => ({ ...r, rank: i + 1 })),
  };

  // Horários
  const hourMap = new Map<number, { calls: number; meetings: number; connections: number; dm: number }>();
  for (const s of ds.sessions) {
    const d = new Date(s.startTime); if (isNaN(d.getTime())) continue;
    const h = d.getHours();
    const b = hourMap.get(h) || { calls: 0, meetings: 0, connections: 0, dm: 0 };
    b.calls += s.calls || 0; b.meetings += s.meetings || 0;
    b.connections += s.connections || 0; b.dm += s.decisionMakers || 0;
    hourMap.set(h, b);
  }
  const horarios: SheetSpec = {
    name: "Horários",
    columns: [
      { header: "Faixa de Horário", key: "label", type: "text", width: 20 },
      { header: "Ligações", key: "calls", type: "int" },
      { header: "Conexões", key: "connections", type: "int" },
      { header: "Quantidade de Decisores", key: "dm", type: "int" },
      { header: "Reuniões Marcadas", key: "meetings", type: "int" },
      { header: "Taxa de Conexão", key: "connRate", type: "percent" },
      { header: "Taxa de Reuniões", key: "meetingRate", type: "percent" },
      { header: "Confiabilidade", key: "confidence", type: "text" },
      { header: "Ranking", key: "rank", type: "int" },
    ],
    rows: [...hourMap.entries()]
      .map(([h, v]) => ({
        label: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`,
        calls: v.calls, connections: v.connections, dm: v.dm, meetings: v.meetings,
        connRate: rate(v.connections, v.calls),
        meetingRate: rate(v.meetings, v.calls),
        confidence: confidenceLabel(v.calls),
      }))
      .sort((a, b) => b.meetingRate - a.meetingRate)
      .map((r, i) => ({ ...r, rank: i + 1 })),
  };

  // Funil
  const funil: SheetSpec = {
    name: "Funil",
    columns: [
      { header: "Etapa", key: "stage", type: "text", width: 26 },
      { header: "Volume", key: "volume", type: "int" },
      { header: "Taxa de Conversão para Próxima", key: "rate", type: "percent" },
    ],
    rows: [
      { stage: "Ligações", volume: ds.totalCalls, rate: rate(ds.totalConnections, ds.totalCalls) },
      { stage: "Conexões", volume: ds.totalConnections, rate: rate(ds.totalDecisionMakers, ds.totalConnections) },
      { stage: "Decisores", volume: ds.totalDecisionMakers, rate: rate(ds.totalMeetings, ds.totalDecisionMakers) },
      { stage: "Reuniões", volume: ds.totalMeetings, rate: 0 },
    ],
  };

  // Produtividade
  const produtividade: SheetSpec = {
    name: "Produtividade",
    columns: [
      { header: "Data", key: "date", type: "date" },
      { header: "Pomodoros no Dia", key: "count", type: "int" },
      { header: "Ligações", key: "calls", type: "int" },
      { header: "Conexões", key: "conn", type: "int" },
      { header: "Decisores", key: "dm", type: "int" },
      { header: "Reuniões", key: "meet", type: "int" },
      { header: "Tempo Produtivo (min)", key: "min", type: "int" },
    ],
    rows: (() => {
      const byDay = new Map<string, { count: number; calls: number; conn: number; dm: number; meet: number; min: number }>();
      for (const s of ds.sessions) {
        const d = new Date(s.startTime); if (isNaN(d.getTime())) continue;
        const k = d.toISOString().slice(0, 10);
        const b = byDay.get(k) || { count: 0, calls: 0, conn: 0, dm: 0, meet: 0, min: 0 };
        b.count++; b.calls += s.calls || 0; b.conn += s.connections || 0;
        b.dm += s.decisionMakers || 0; b.meet += s.meetings || 0; b.min += s.durationMinutes || 0;
        byDay.set(k, b);
      }
      return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date: new Date(`${date}T00:00:00`), ...v }));
    })(),
  };

  // Insights / Alertas gerados pelo motor
  const allInsights = sortInsights(getInsights());
  const insights: SheetSpec = {
    name: "Insights",
    columns: [
      { header: "Data de Criação", key: "created", type: "datetime" },
      { header: "Última Atualização", key: "updated", type: "datetime" },
      { header: "Status", key: "status", type: "text" },
      { header: "Prioridade", key: "priority", type: "text" },
      { header: "Categoria", key: "category", type: "text" },
      { header: "Título", key: "title", type: "text", width: 40 },
      { header: "Descrição", key: "description", type: "text", width: 60 },
      { header: "Motivo", key: "reason", type: "text", width: 60 },
      { header: "Sugestão de Ação", key: "suggestion", type: "text", width: 60 },
      { header: "Confiabilidade", key: "confidence", type: "text" },
    ],
    rows: allInsights.map((i) => ({
      created: new Date(i.createdAt),
      updated: new Date(i.updatedAt),
      status: i.status === "active" ? "Ativo" : "Resolvido",
      priority: PRIORITY_LABELS[i.priority],
      category: CATEGORY_LABELS[i.category],
      title: i.title,
      description: i.description,
      reason: i.reason,
      suggestion: i.suggestion,
      confidence: i.confidence === "high" ? "Alta" : i.confidence === "medium" ? "Média" : "Baixa",
    })),
  };

  const alertas: SheetSpec = {
    name: "Alertas",
    columns: insights.columns,
    rows: insights.rows.filter((r) => r.priority === "Crítica" || r.priority === "Alta"),
  };

  void COLD_CALL_STAGES; void OPORTUNIDADES_STAGES;
  return [cidades, nichos, campanhas, scripts, horarios, funil, produtividade, insights, alertas];
}
