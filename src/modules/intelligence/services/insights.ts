// ============================================================
// Motor de Insights Inteligentes
// ------------------------------------------------------------
// Este arquivo NÃO usa IA externa. Ele simula um "Diretor Comercial"
// através de regras de negócio determinísticas aplicadas sobre os
// dados reais do CRM. Cada regra:
//   - tem ID, categoria, prioridade e status ativo/inativo
//   - roda contra um contexto único (RuleContext)
//   - retorna 0..N Insights, cada um com "causeKey" para dedup
//
// A UI consome apenas `getInsights()` e `runInsightsEngine()`.
// No futuro esta camada pode ser trocada por uma IA — a interface
// não precisará ser alterada.
// ============================================================

import { uload as load, usave as save } from "@/shared/services/userStorage";
import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  getGoalsSettings, type Lead, type Meeting, type MovementEvent,
  type PomodoroSession,
} from "@/shared/services/store";
import { getTransactions, monthKey, type FinanceTransaction } from "@/modules/financeiro/services/finance";
import { getReminders, type Reminder } from "@/modules/agenda/services/reminders";
import { getCallLogs, type CallLog } from "@/modules/knowledge/services/scripts";
import { getTasks, type ScrumTask } from "@/modules/metas/services/scrum";

// ---------- Tipos públicos ----------
export type InsightPriority = "critica" | "alta" | "media" | "baixa";
export type InsightCategory =
  | "cidade" | "nicho" | "campanha" | "script" | "horario"
  | "produtividade" | "funil" | "metas" | "pipeline"
  | "comercial" | "financeiro" | "crm";
export type InsightConfidence = "high" | "medium" | "low";
export type InsightStatus = "active" | "resolved";

export interface Insight {
  id: string;
  ruleId: string;
  causeKey: string; // dedupe
  title: string;
  description: string;
  reason: string;
  suggestion: string;
  priority: InsightPriority;
  category: InsightCategory;
  confidence: InsightConfidence;
  createdAt: string;
  updatedAt: string;
  status: InsightStatus;
  resolvedAt?: string;
}

export interface GeneratedInsight {
  causeKey: string;
  title: string;
  description: string;
  reason: string;
  suggestion: string;
  priority: InsightPriority;
  category: InsightCategory;
  confidence: InsightConfidence;
}

export interface Rule {
  id: string;
  name: string;
  category: InsightCategory;
  description: string;
  defaultPriority: InsightPriority;
  createdAt: string;
  evaluate(ctx: RuleContext): GeneratedInsight[] | null;
}

export interface RuleContext {
  now: Date;
  leads: Lead[];
  meetings: Meeting[];
  events: MovementEvent[];
  sessions: PomodoroSession[];
  transactions: FinanceTransaction[];
  reminders: Reminder[];
  callLogs: CallLog[];
  tasks: ScrumTask[];
  goals: ReturnType<typeof getGoalsSettings>;
}

// ---------- Persistência ----------
const INSIGHTS_KEY = "p21_insights";
const OVERRIDES_KEY = "p21_rule_overrides";
const LAST_RUN_KEY = "p21_insights_last_run";

interface RuleOverride { enabled: boolean; lastRunAt?: string }
type OverridesMap = Record<string, RuleOverride>;

export function getInsights(): Insight[] {
  return load<Insight[]>(INSIGHTS_KEY, []);
}
export function saveInsights(list: Insight[]) { save(INSIGHTS_KEY, list); }

export function getRuleOverrides(): OverridesMap {
  return load<OverridesMap>(OVERRIDES_KEY, {});
}
export function setRuleEnabled(ruleId: string, enabled: boolean) {
  const o = getRuleOverrides();
  o[ruleId] = { ...(o[ruleId] || {}), enabled };
  save(OVERRIDES_KEY, o);
}
export function isRuleEnabled(ruleId: string): boolean {
  const o = getRuleOverrides()[ruleId];
  return o?.enabled ?? true;
}
export function getLastRunAt(): string | null {
  return load<string | null>(LAST_RUN_KEY, null);
}

// ---------- Utilitários ----------
const norm = (s: string | undefined | null) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();

const CAMPAIGN_SPLIT = /\s+[-–—]\s+/;
function parseNiche(niche: string) {
  const raw = (niche || "").trim();
  if (!raw) return { niche: "" };
  if (CAMPAIGN_SPLIT.test(raw)) return { niche: raw.split(CAMPAIGN_SPLIT)[0].trim() };
  return { niche: raw };
}

function daysAgo(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return Infinity;
  return (now.getTime() - t) / 86400000;
}

function confidenceFromCalls(calls: number): InsightConfidence {
  if (calls >= 100) return "high";
  if (calls >= 30) return "medium";
  return "low";
}

interface Segment {
  key: string; label: string;
  calls: number; meetings: number;
}
function bucketBy<T>(items: T[], keyFn: (t: T) => { key: string; label: string } | null): Map<string, Segment> {
  const map = new Map<string, Segment>();
  const ensure = (key: string, label: string) => {
    if (!map.has(key)) map.set(key, { key, label, calls: 0, meetings: 0 });
    return map.get(key)!;
  };
  items.forEach(() => {}); // silence unused generic
  return map as any; // helper only for typing; buckets are populated by callers
  void ensure; void keyFn;
}
void bucketBy;

// ---------- Regras ----------

const RULES: Rule[] = [];
const createdAt = "2026-01-01T00:00:00.000Z";
function rule(r: Omit<Rule, "createdAt">) { RULES.push({ ...r, createdAt }); }

/** CIDADE_DESTAQUE + CIDADE_QUEDA */
rule({
  id: "cidade_destaque",
  name: "Cidade em destaque",
  category: "cidade",
  description: "Detecta cidade líder em taxa de reuniões com amostra ≥ 30 ligações.",
  defaultPriority: "media",
  evaluate: ({ leads, events, meetings }) => {
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const seg = new Map<string, Segment>();
    const ensure = (key: string, label: string) => {
      if (!seg.has(key)) seg.set(key, { key, label, calls: 0, meetings: 0 });
      return seg.get(key)!;
    };
    for (const e of events) {
      if (e.type !== "call") continue;
      const l = leadById.get(e.leadId); if (!l?.city) continue;
      ensure(norm(l.city), l.city).calls++;
    }
    for (const m of meetings) {
      const l = leadById.get(m.leadId); if (!l?.city) continue;
      ensure(norm(l.city), l.city).meetings++;
    }
    const usable = [...seg.values()].filter((s) => s.calls >= 30);
    if (usable.length < 2) return null;
    const sorted = usable.map((s) => ({ ...s, rate: (s.meetings / s.calls) * 100 }))
      .sort((a, b) => b.rate - a.rate);
    const best = sorted[0], avg = sorted.reduce((a, b) => a + b.rate, 0) / sorted.length;
    if (best.rate <= avg) return null;
    return [{
      causeKey: `cidade_destaque:${best.key}`,
      title: "Cidade em destaque",
      description: `${best.label} apresenta a maior taxa de reuniões da operação (${best.rate.toFixed(1)}%).`,
      reason: `Base de ${best.calls} ligações e ${best.meetings} reuniões, acima da média de ${avg.toFixed(1)}%.`,
      suggestion: "Considere aumentar o volume de prospecção nesta cidade.",
      priority: "alta",
      category: "cidade",
      confidence: confidenceFromCalls(best.calls),
    }];
  },
});

rule({
  id: "cidade_queda",
  name: "Cidade em queda",
  category: "cidade",
  description: "Cidade cuja taxa de conversão caiu >20% nos últimos 30 dias vs 30 anteriores.",
  defaultPriority: "alta",
  evaluate: ({ now, leads, events, meetings }) => {
    return segmentDropInsights({
      groupBy: (l) => l.city ? { key: norm(l.city), label: l.city } : null,
      now, leads, events, meetings,
      categoryLabel: "Cidade",
      category: "cidade",
      ruleIdPrefix: "cidade_queda",
      suggestion: "Revise a abordagem/qualidade dos leads desta cidade antes de escalar.",
    });
  },
});

rule({
  id: "nicho_campeao",
  name: "Nicho campeão",
  category: "nicho",
  description: "Nicho com maior taxa de reuniões.",
  defaultPriority: "media",
  evaluate: ({ leads, events, meetings }) => leaderInsight({
    leads, events, meetings,
    groupBy: (l) => {
      const n = parseNiche(l.niche || "").niche;
      return n ? { key: norm(n), label: n } : null;
    },
    ruleId: "nicho_campeao",
    title: "Nicho campeão",
    category: "nicho",
    priority: "alta",
    suggestion: "Priorize expansão de campanhas neste nicho.",
    entity: "Nicho",
  }),
});

rule({
  id: "nicho_queda",
  name: "Nicho em queda",
  category: "nicho",
  description: "Nicho cuja conversão caiu >20% no último período.",
  defaultPriority: "alta",
  evaluate: ({ now, leads, events, meetings }) => segmentDropInsights({
    groupBy: (l) => {
      const n = parseNiche(l.niche || "").niche;
      return n ? { key: norm(n), label: n } : null;
    },
    now, leads, events, meetings,
    categoryLabel: "Nicho", category: "nicho",
    ruleIdPrefix: "nicho_queda",
    suggestion: "Reavalie script e oferta para este nicho.",
  }),
});

rule({
  id: "campanha_campea",
  name: "Campanha campeã",
  category: "campanha",
  description: "Campanha (nicho + cidade) com maior conversão.",
  defaultPriority: "media",
  evaluate: ({ leads, events, meetings }) => leaderInsight({
    leads, events, meetings,
    groupBy: (l) => {
      const n = parseNiche(l.niche || "").niche;
      if (!n || !l.city) return null;
      return { key: `${norm(n)}||${norm(l.city)}`, label: `${n} — ${l.city}` };
    },
    ruleId: "campanha_campea",
    title: "Campanha campeã",
    category: "campanha",
    priority: "alta",
    suggestion: "Escale essa campanha aumentando novos leads no mesmo par.",
    entity: "Campanha",
  }),
});

rule({
  id: "campanha_baixa",
  name: "Campanha com baixo desempenho",
  category: "campanha",
  description: "Campanha com conversão inferior à média geral.",
  defaultPriority: "media",
  evaluate: ({ leads, events, meetings }) => underperformInsight({
    leads, events, meetings,
    groupBy: (l) => {
      const n = parseNiche(l.niche || "").niche;
      if (!n || !l.city) return null;
      return { key: `${norm(n)}||${norm(l.city)}`, label: `${n} — ${l.city}` };
    },
    ruleIdPrefix: "campanha_baixa",
    entity: "Campanha",
    category: "campanha",
    suggestion: "Pause ou revise essa campanha; teste novo script ou oferta.",
    priority: "media",
  }),
});

rule({
  id: "melhor_horario",
  name: "Melhor horário",
  category: "horario",
  description: "Faixa horária com maior taxa de reuniões.",
  defaultPriority: "media",
  evaluate: ({ sessions }) => {
    const buckets = new Map<number, { calls: number; meetings: number }>();
    for (const s of sessions) {
      const d = new Date(s.startTime); if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      const b = buckets.get(h) || { calls: 0, meetings: 0 };
      b.calls += s.calls || 0; b.meetings += s.meetings || 0;
      buckets.set(h, b);
    }
    const arr = [...buckets.entries()]
      .filter(([, b]) => b.calls >= 30)
      .map(([h, b]) => ({ h, calls: b.calls, meetings: b.meetings, rate: (b.meetings / b.calls) * 100 }))
      .sort((a, b) => b.rate - a.rate);
    if (arr.length < 2) return null;
    const best = arr[0];
    const label = `${String(best.h).padStart(2, "0")}:00–${String(best.h + 1).padStart(2, "0")}:00`;
    return [{
      causeKey: `melhor_horario:${best.h}`,
      title: "Melhor horário para prospecção",
      description: `A faixa ${label} concentra a maior taxa de reuniões (${best.rate.toFixed(1)}%).`,
      reason: `Base de ${best.calls} ligações nesta faixa, superior às demais.`,
      suggestion: "Concentre o esforço de ligações neste horário.",
      priority: "alta",
      category: "horario",
      confidence: confidenceFromCalls(best.calls),
    }];
  },
});

rule({
  id: "horario_baixo",
  name: "Horário com baixo retorno",
  category: "horario",
  description: "Faixa horária com conversão muito inferior às demais.",
  defaultPriority: "media",
  evaluate: ({ sessions }) => {
    const buckets = new Map<number, { calls: number; meetings: number }>();
    for (const s of sessions) {
      const d = new Date(s.startTime); if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      const b = buckets.get(h) || { calls: 0, meetings: 0 };
      b.calls += s.calls || 0; b.meetings += s.meetings || 0;
      buckets.set(h, b);
    }
    const arr = [...buckets.entries()]
      .filter(([, b]) => b.calls >= 30)
      .map(([h, b]) => ({ h, calls: b.calls, rate: (b.meetings / b.calls) * 100 }));
    if (arr.length < 3) return null;
    const avg = arr.reduce((a, b) => a + b.rate, 0) / arr.length;
    const worst = arr.slice().sort((a, b) => a.rate - b.rate)[0];
    if (worst.rate >= avg * 0.5) return null;
    const label = `${String(worst.h).padStart(2, "0")}:00–${String(worst.h + 1).padStart(2, "0")}:00`;
    return [{
      causeKey: `horario_baixo:${worst.h}`,
      title: "Horário com baixo retorno",
      description: `A faixa ${label} converte apenas ${worst.rate.toFixed(1)}% (média ${avg.toFixed(1)}%).`,
      reason: `Conversão significativamente abaixo dos demais horários.`,
      suggestion: "Reduza ou realoque esforço deste horário para faixas mais produtivas.",
      priority: "media",
      category: "horario",
      confidence: confidenceFromCalls(worst.calls),
    }];
  },
});

rule({
  id: "script_campeao",
  name: "Script campeão",
  category: "script",
  description: "Script utilizado com maior taxa de reuniões.",
  defaultPriority: "alta",
  evaluate: ({ callLogs, sessions }) => {
    // Aproxima taxa de reuniões por script correlacionando volume de logs por script
    // com reuniões do período. Sem log de script por sessão, usamos scriptUsed em sessions.
    const map = new Map<string, { calls: number; meetings: number }>();
    for (const s of sessions) {
      const script = (s as any).scriptUsed as string | undefined;
      if (!script) continue;
      const b = map.get(script) || { calls: 0, meetings: 0 };
      b.calls += s.calls || 0; b.meetings += s.meetings || 0;
      map.set(script, b);
    }
    // Complementa com logs (contagem de ligações)
    for (const log of callLogs) {
      const b = map.get(log.scriptUsed) || { calls: 0, meetings: 0 };
      b.calls += 1; map.set(log.scriptUsed, b);
    }
    const arr = [...map.entries()]
      .filter(([, b]) => b.calls >= 30)
      .map(([k, b]) => ({ script: k, ...b, rate: b.calls ? (b.meetings / b.calls) * 100 : 0 }))
      .sort((a, b) => b.rate - a.rate);
    if (arr.length < 2) return null;
    const best = arr[0];
    return [{
      causeKey: `script_campeao:${best.script}`,
      title: "Script campeão",
      description: `${best.script} apresenta a maior taxa de reuniões (${best.rate.toFixed(1)}%).`,
      reason: `Base de ${best.calls} ligações registradas com este script.`,
      suggestion: "Padronize este script como referência para o time.",
      priority: "alta",
      category: "script",
      confidence: confidenceFromCalls(best.calls),
    }];
  },
});

rule({
  id: "script_baixo",
  name: "Script com baixo desempenho",
  category: "script",
  description: "Script com conversão inferior à média dos demais.",
  defaultPriority: "media",
  evaluate: ({ callLogs, sessions }) => {
    const map = new Map<string, { calls: number; meetings: number }>();
    for (const s of sessions) {
      const script = (s as any).scriptUsed as string | undefined;
      if (!script) continue;
      const b = map.get(script) || { calls: 0, meetings: 0 };
      b.calls += s.calls || 0; b.meetings += s.meetings || 0;
      map.set(script, b);
    }
    for (const log of callLogs) {
      const b = map.get(log.scriptUsed) || { calls: 0, meetings: 0 };
      b.calls += 1; map.set(log.scriptUsed, b);
    }
    const arr = [...map.entries()]
      .filter(([, b]) => b.calls >= 30)
      .map(([k, b]) => ({ script: k, ...b, rate: b.calls ? (b.meetings / b.calls) * 100 : 0 }));
    if (arr.length < 2) return null;
    const avg = arr.reduce((a, b) => a + b.rate, 0) / arr.length;
    const worst = arr.slice().sort((a, b) => a.rate - b.rate)[0];
    if (worst.rate >= avg) return null;
    return [{
      causeKey: `script_baixo:${worst.script}`,
      title: "Script com baixo desempenho",
      description: `${worst.script} converte ${worst.rate.toFixed(1)}%, abaixo da média (${avg.toFixed(1)}%).`,
      reason: `Base de ${worst.calls} ligações; performance inferior aos demais scripts.`,
      suggestion: "Refine ou substitua este script; treine a equipe.",
      priority: "media",
      category: "script",
      confidence: confidenceFromCalls(worst.calls),
    }];
  },
});

// ---------- Metas ----------
rule({
  id: "meta_status",
  name: "Progresso da meta",
  category: "metas",
  description: "Detecta meta próxima, atingida ou em risco no mês corrente.",
  defaultPriority: "alta",
  evaluate: ({ now, transactions, goals }) => {
    const goal = goals.monthlyRevenueGoal || 0;
    if (goal <= 0) return null;
    const mk = now.toISOString().slice(0, 7);
    const revenue = transactions.filter((t) => t.kind === "revenue" && monthKey(t.date) === mk)
      .reduce((a, b) => a + b.amount, 0);
    const pct = (revenue / goal) * 100;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expected = (dayOfMonth / daysInMonth) * 100;

    if (pct >= 100) {
      return [{
        causeKey: `meta_atingida:${mk}`,
        title: "Meta atingida",
        description: `A meta mensal de ${goal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} foi atingida (${pct.toFixed(0)}%).`,
        reason: "Receita reconhecida no mês igualou ou superou a meta.",
        suggestion: "Defina meta esticada para o restante do mês.",
        priority: "alta", category: "metas", confidence: "high",
      }];
    }
    if (pct >= 90) {
      return [{
        causeKey: `meta_proxima:${mk}`,
        title: "Meta próxima do fechamento",
        description: `Já foram ${pct.toFixed(0)}% da meta do mês.`,
        reason: `Faltam ${(100 - pct).toFixed(0)} p.p. para atingir ${goal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        suggestion: "Priorize propostas em aberto para fechar o mês.",
        priority: "alta", category: "metas", confidence: "high",
      }];
    }
    if (pct + 15 < expected) {
      return [{
        causeKey: `meta_risco:${mk}`,
        title: "Meta em risco",
        description: `Projeção do mês está ${pct.toFixed(0)}% quando o esperado seria ~${expected.toFixed(0)}%.`,
        reason: "Ritmo atual de receita indica não bater a meta ao final do mês.",
        suggestion: "Aumente ligações e acelere follow-ups de proposta.",
        priority: "critica", category: "metas", confidence: "high",
      }];
    }
    return null;
  },
});

// ---------- Produtividade ----------
rule({
  id: "produtividade",
  name: "Produtividade da última semana",
  category: "produtividade",
  description: "Compara ligações da última semana com a média das 4 anteriores.",
  defaultPriority: "media",
  evaluate: ({ now, sessions }) => {
    const day = 86400000;
    const inRange = (iso: string, s: number, e: number) => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= s && t <= e;
    };
    const lastEnd = now.getTime();
    const lastStart = lastEnd - 7 * day;
    const prevEnd = lastStart;
    const prevStart = prevEnd - 28 * day;
    const sumCalls = (ss: PomodoroSession[]) => ss.reduce((a, b) => a + (b.calls || 0), 0);
    const last = sumCalls(sessions.filter((s) => inRange(s.startTime, lastStart, lastEnd)));
    const prev = sumCalls(sessions.filter((s) => inRange(s.startTime, prevStart, prevEnd)));
    const prevAvg = prev / 4;
    if (prevAvg < 10) return null;
    if (last >= prevAvg * 1.2) {
      return [{
        causeKey: `produtividade_alta:${new Date(lastStart).toISOString().slice(0, 10)}`,
        title: "Produtividade em alta",
        description: `Foram ${last} ligações na última semana, ${((last / prevAvg - 1) * 100).toFixed(0)}% acima da média.`,
        reason: "Volume semanal de pomodoros acima da média das 4 semanas anteriores.",
        suggestion: "Mantenha a cadência; documente a rotina que gerou este resultado.",
        priority: "media", category: "produtividade", confidence: "medium",
      }];
    }
    if (last <= prevAvg * 0.7) {
      return [{
        causeKey: `produtividade_queda:${new Date(lastStart).toISOString().slice(0, 10)}`,
        title: "Queda de produtividade",
        description: `Última semana teve ${last} ligações (${((1 - last / prevAvg) * 100).toFixed(0)}% abaixo da média).`,
        reason: "Volume semanal de pomodoros abaixo da média das 4 semanas anteriores.",
        suggestion: "Aumente ligações diárias; revise bloqueios de agenda.",
        priority: "alta", category: "produtividade", confidence: "medium",
      }];
    }
    return null;
  },
});

// ---------- Funil ----------
rule({
  id: "funil_gargalo",
  name: "Gargalo do funil",
  category: "funil",
  description: "Detecta a maior queda de conversão entre etapas do funil.",
  defaultPriority: "alta",
  evaluate: ({ sessions, goals }) => {
    const totals = sessions.reduce((acc, s) => ({
      calls: acc.calls + (s.calls || 0),
      connections: acc.connections + (s.connections || 0),
      decisionMakers: acc.decisionMakers + (s.decisionMakers || 0),
      meetings: acc.meetings + (s.meetings || 0),
    }), { calls: 0, connections: 0, decisionMakers: 0, meetings: 0 });
    if (totals.calls < 30) return null;
    const steps = [
      { name: "Ligação → Conexão", actual: totals.connections / totals.calls * 100, target: goals.callToConnection },
      { name: "Conexão → Decisor", actual: totals.connections ? totals.decisionMakers / totals.connections * 100 : 0, target: goals.connectionToDecisionMaker },
      { name: "Decisor → Reunião", actual: totals.decisionMakers ? totals.meetings / totals.decisionMakers * 100 : 0, target: goals.decisionMakerToMeetingScheduled },
    ];
    const gap = steps.map((s) => ({ ...s, gap: s.target - s.actual })).sort((a, b) => b.gap - a.gap)[0];
    if (!gap || gap.gap <= 5) return null;
    return [{
      causeKey: `funil_gargalo:${gap.name}`,
      title: "Gargalo do funil identificado",
      description: `Maior gargalo atual: ${gap.name} (${gap.actual.toFixed(1)}% vs meta ${gap.target}%).`,
      reason: "Etapa com maior diferença entre desempenho real e meta configurada.",
      suggestion: gap.name.includes("Conexão") ? "Melhore horários e cadência de ligação." :
                  gap.name.includes("Decisor") ? "Refine qualificação e abordagem inicial." :
                  "Treine fechamento de agendamento e prova social.",
      priority: "critica", category: "funil", confidence: "high",
    }];
  },
});

// ---------- Follow-ups / Reuniões / Pipeline ----------
rule({
  id: "followups_atrasados",
  name: "Follow-ups atrasados",
  category: "comercial",
  description: "Lembretes pendentes com data de execução no passado.",
  defaultPriority: "alta",
  evaluate: ({ now, reminders }) => {
    const overdue = reminders.filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() < now.getTime());
    if (overdue.length === 0) return null;
    return [{
      causeKey: `followups_atrasados:${overdue.length}`,
      title: `${overdue.length} follow-up(s) atrasado(s)`,
      description: `Existem ${overdue.length} lembretes vencidos aguardando ação.`,
      reason: "Lembretes pendentes com data de execução no passado.",
      suggestion: "Abra a aba Lembretes e execute ou reprograme os atrasados.",
      priority: overdue.length >= 5 ? "critica" : "alta",
      category: "comercial", confidence: "high",
    }];
  },
});

rule({
  id: "reunioes_nao_confirmadas",
  name: "Reuniões próximas sem confirmação",
  category: "comercial",
  description: "Reuniões nas próximas 24h sem sinal de confirmação registrado.",
  defaultPriority: "alta",
  evaluate: ({ now, meetings, leads }) => {
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const soon = meetings.filter((m) => {
      const t = new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
      return !isNaN(t) && t > now.getTime() && t <= now.getTime() + 24 * 3600 * 1000;
    });
    // Considera "não confirmada" quando não existe nota mencionando "confirmad" no lead.
    const unconfirmed = soon.filter((m) => {
      const l = leadById.get(m.leadId);
      const notes = [(l?.notes || ""), ...(l?.callNotes || []).map((n) => n.text)].join(" ").toLowerCase();
      return !notes.includes("confirmad");
    });
    if (unconfirmed.length === 0) return null;
    return [{
      causeKey: `reunioes_nao_confirmadas:${unconfirmed.length}`,
      title: `${unconfirmed.length} reunião(ões) sem confirmação em 24h`,
      description: `Existem reuniões nas próximas 24 horas sem registro de confirmação.`,
      reason: "Nenhuma anotação recente do lead menciona confirmação da reunião.",
      suggestion: "Envie mensagem de confirmação para reduzir no-show.",
      priority: "critica", category: "comercial", confidence: "medium",
    }];
  },
});

rule({
  id: "pipeline_parado",
  name: "Oportunidades paradas",
  category: "pipeline",
  description: "Leads em oportunidades sem movimentação há mais de 10 dias.",
  defaultPriority: "media",
  evaluate: ({ now, leads }) => {
    const stagnated = leads.filter((l) => {
      const p = ["Reunião Marcada", "Reunião Realizada", "Documento de Guerra", "Proposta Enviada"];
      if (!p.includes(l.stage)) return false;
      return daysAgo(l.stageChangedAt, now) > 10;
    });
    if (stagnated.length === 0) return null;
    return [{
      causeKey: `pipeline_parado:${stagnated.length}`,
      title: `${stagnated.length} oportunidade(s) paradas há +10 dias`,
      description: `Leads em etapas comerciais sem movimentação recente.`,
      reason: "Sem alteração de etapa nos últimos 10 dias.",
      suggestion: "Faça follow-up ou mova para 'Perdido' para higienizar o funil.",
      priority: "alta", category: "pipeline", confidence: "high",
    }];
  },
});

// ---------- Tarefas ----------
rule({
  id: "tarefas_vencidas",
  name: "Tarefas vencidas",
  category: "crm",
  description: "Tarefas de sprint em curso não concluídas após o fim do sprint.",
  defaultPriority: "media",
  evaluate: ({ now, tasks }) => {
    // Sprint end não está no contexto; usamos updatedAt > 14 dias como heurística.
    const stale = tasks.filter((t) => t.status !== "done" && daysAgo(t.updatedAt || t.createdAt, now) > 14);
    if (stale.length === 0) return null;
    return [{
      causeKey: `tarefas_vencidas:${stale.length}`,
      title: `${stale.length} tarefa(s) sem atualização há +14 dias`,
      description: `Tarefas ativas sem atualização recente.`,
      reason: "Sem alterações há mais de 14 dias.",
      suggestion: "Revise, priorize ou arquive essas tarefas.",
      priority: "media", category: "crm", confidence: "medium",
    }];
  },
});

// ---------- Financeiro ----------
rule({
  id: "financeiro_queda",
  name: "Queda de receita",
  category: "financeiro",
  description: "Compara receita do mês corrente vs mês anterior.",
  defaultPriority: "alta",
  evaluate: ({ now, transactions }) => {
    const cur = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const prev = prevDate.toISOString().slice(0, 7);
    const sum = (mk: string) => transactions.filter((t) => t.kind === "revenue" && monthKey(t.date) === mk)
      .reduce((a, b) => a + b.amount, 0);
    const curR = sum(cur), prevR = sum(prev);
    if (prevR < 1000) return null;
    const drop = (prevR - curR) / prevR;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // ajusta comparação proporcional (mês corrente incompleto)
    const projected = curR / dayOfMonth * daysInMonth;
    const projDrop = (prevR - projected) / prevR;
    if (projDrop > 0.2) {
      return [{
        causeKey: `financeiro_queda:${cur}`,
        title: "Queda de receita projetada",
        description: `Receita projetada do mês (${projected.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) é ${(projDrop * 100).toFixed(0)}% inferior ao mês anterior.`,
        reason: `Mês anterior fechou em ${prevR.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        suggestion: "Acelere fechamentos e revise pipeline de propostas.",
        priority: "critica", category: "financeiro", confidence: "high",
      }];
    }
    if (drop > 0.2 && curR > 0) {
      return [{
        causeKey: `financeiro_queda_real:${cur}`,
        title: "Receita atual abaixo do mês anterior",
        description: `Receita reconhecida cai ${(drop * 100).toFixed(0)}% vs mês anterior.`,
        reason: `Mês anterior: ${prevR.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · Atual: ${curR.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        suggestion: "Priorize propostas em aberto e revise churn.",
        priority: "alta", category: "financeiro", confidence: "high",
      }];
    }
    return null;
  },
});

// ---------- Crescimento / Queda geral ----------
rule({
  id: "crescimento",
  name: "Evolução da operação",
  category: "comercial",
  description: "Reuniões marcadas cresceram vs período anterior.",
  defaultPriority: "media",
  evaluate: ({ now, meetings }) => {
    const day = 86400000;
    const t = now.getTime();
    const cur = meetings.filter((m) => {
      const ts = new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
      return ts >= t - 30 * day && ts <= t;
    }).length;
    const prev = meetings.filter((m) => {
      const ts = new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
      return ts >= t - 60 * day && ts < t - 30 * day;
    }).length;
    if (prev < 5) return null;
    const change = (cur - prev) / prev;
    if (change >= 0.2) {
      return [{
        causeKey: `crescimento:${new Date(t - 30 * day).toISOString().slice(0, 10)}`,
        title: "Crescimento da operação",
        description: `Reuniões dos últimos 30 dias (${cur}) subiram ${(change * 100).toFixed(0)}% vs período anterior (${prev}).`,
        reason: "Aumento consistente no volume de reuniões marcadas.",
        suggestion: "Escale o que está funcionando: mais leads no mesmo padrão.",
        priority: "media", category: "comercial", confidence: "high",
      }];
    }
    if (change <= -0.2) {
      return [{
        causeKey: `queda_geral:${new Date(t - 30 * day).toISOString().slice(0, 10)}`,
        title: "Queda geral da operação",
        description: `Reuniões dos últimos 30 dias (${cur}) caíram ${(Math.abs(change) * 100).toFixed(0)}% vs período anterior (${prev}).`,
        reason: "Redução consistente no volume de reuniões marcadas.",
        suggestion: "Reveja qualidade dos leads, script e cadência de contato.",
        priority: "critica", category: "comercial", confidence: "high",
      }];
    }
    return null;
  },
});

// ---------- Helpers de regras ----------

interface LeaderArgs {
  leads: Lead[]; events: MovementEvent[]; meetings: Meeting[];
  groupBy: (l: Lead) => { key: string; label: string } | null;
  ruleId: string; title: string; category: InsightCategory;
  priority: InsightPriority; suggestion: string; entity: string;
}
function leaderInsight(a: LeaderArgs): GeneratedInsight[] | null {
  const leadById = new Map(a.leads.map((l) => [l.id, l]));
  const map = new Map<string, Segment>();
  const ensure = (key: string, label: string) => {
    if (!map.has(key)) map.set(key, { key, label, calls: 0, meetings: 0 });
    return map.get(key)!;
  };
  for (const e of a.events) {
    if (e.type !== "call") continue;
    const l = leadById.get(e.leadId); if (!l) continue;
    const g = a.groupBy(l); if (!g) continue;
    ensure(g.key, g.label).calls++;
  }
  for (const m of a.meetings) {
    const l = leadById.get(m.leadId); if (!l) continue;
    const g = a.groupBy(l); if (!g) continue;
    ensure(g.key, g.label).meetings++;
  }
  const usable = [...map.values()].filter((s) => s.calls >= 30);
  if (usable.length < 2) return null;
  const arr = usable.map((s) => ({ ...s, rate: (s.meetings / s.calls) * 100 })).sort((x, y) => y.rate - x.rate);
  const best = arr[0], second = arr[1];
  if (best.rate - second.rate < 2) return null;
  return [{
    causeKey: `${a.ruleId}:${best.key}`,
    title: a.title,
    description: `${best.label} lidera com taxa de reuniões de ${best.rate.toFixed(1)}%.`,
    reason: `Base de ${best.calls} ligações — ${(best.rate - second.rate).toFixed(1)} p.p. acima do 2º colocado.`,
    suggestion: a.suggestion,
    priority: a.priority, category: a.category,
    confidence: confidenceFromCalls(best.calls),
  }];
}

interface UnderArgs {
  leads: Lead[]; events: MovementEvent[]; meetings: Meeting[];
  groupBy: (l: Lead) => { key: string; label: string } | null;
  ruleIdPrefix: string; entity: string;
  category: InsightCategory; suggestion: string; priority: InsightPriority;
}
function underperformInsight(a: UnderArgs): GeneratedInsight[] | null {
  const leadById = new Map(a.leads.map((l) => [l.id, l]));
  const map = new Map<string, Segment>();
  const ensure = (key: string, label: string) => {
    if (!map.has(key)) map.set(key, { key, label, calls: 0, meetings: 0 });
    return map.get(key)!;
  };
  for (const e of a.events) {
    if (e.type !== "call") continue;
    const l = leadById.get(e.leadId); if (!l) continue;
    const g = a.groupBy(l); if (!g) continue;
    ensure(g.key, g.label).calls++;
  }
  for (const m of a.meetings) {
    const l = leadById.get(m.leadId); if (!l) continue;
    const g = a.groupBy(l); if (!g) continue;
    ensure(g.key, g.label).meetings++;
  }
  const usable = [...map.values()].filter((s) => s.calls >= 30);
  if (usable.length < 3) return null;
  const arr = usable.map((s) => ({ ...s, rate: (s.meetings / s.calls) * 100 }));
  const avg = arr.reduce((a, b) => a + b.rate, 0) / arr.length;
  const worst = arr.slice().sort((x, y) => x.rate - y.rate)[0];
  if (worst.rate >= avg * 0.7) return null;
  return [{
    causeKey: `${a.ruleIdPrefix}:${worst.key}`,
    title: `${a.entity} com baixo desempenho`,
    description: `${worst.label} converte ${worst.rate.toFixed(1)}%, abaixo da média (${avg.toFixed(1)}%).`,
    reason: `Base de ${worst.calls} ligações; desempenho consistentemente inferior.`,
    suggestion: a.suggestion,
    priority: a.priority, category: a.category,
    confidence: confidenceFromCalls(worst.calls),
  }];
}

interface DropArgs {
  now: Date;
  leads: Lead[]; events: MovementEvent[]; meetings: Meeting[];
  groupBy: (l: Lead) => { key: string; label: string } | null;
  categoryLabel: string; category: InsightCategory;
  ruleIdPrefix: string; suggestion: string;
}
function segmentDropInsights(a: DropArgs): GeneratedInsight[] | null {
  const day = 86400000, t = a.now.getTime();
  const leadById = new Map(a.leads.map((l) => [l.id, l]));
  const period = (fromDays: number, toDays: number) => {
    const start = t - fromDays * day, end = t - toDays * day;
    const map = new Map<string, Segment>();
    const ensure = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, { key, label, calls: 0, meetings: 0 });
      return map.get(key)!;
    };
    for (const e of a.events) {
      const ts = new Date(e.timestamp).getTime();
      if (isNaN(ts) || ts < start || ts > end || e.type !== "call") continue;
      const l = leadById.get(e.leadId); if (!l) continue;
      const g = a.groupBy(l); if (!g) continue;
      ensure(g.key, g.label).calls++;
    }
    for (const m of a.meetings) {
      const ts = new Date(`${m.date}T${m.time || "00:00"}:00`).getTime();
      if (isNaN(ts) || ts < start || ts > end) continue;
      const l = leadById.get(m.leadId); if (!l) continue;
      const g = a.groupBy(l); if (!g) continue;
      ensure(g.key, g.label).meetings++;
    }
    return map;
  };
  const cur = period(30, 0), prev = period(60, 30);
  const out: GeneratedInsight[] = [];
  for (const [k, c] of cur) {
    if (c.calls < 30) continue;
    const p = prev.get(k); if (!p || p.calls < 30) continue;
    const curRate = c.meetings / c.calls;
    const prevRate = p.meetings / p.calls;
    if (prevRate === 0) continue;
    const drop = (prevRate - curRate) / prevRate;
    if (drop > 0.2) {
      out.push({
        causeKey: `${a.ruleIdPrefix}:${k}`,
        title: `${a.categoryLabel} em queda`,
        description: `${c.label} caiu ${(drop * 100).toFixed(0)}% na taxa de reuniões vs período anterior.`,
        reason: `De ${(prevRate * 100).toFixed(1)}% para ${(curRate * 100).toFixed(1)}% em 30 dias.`,
        suggestion: a.suggestion,
        priority: "alta", category: a.category,
        confidence: confidenceFromCalls(c.calls),
      });
    }
  }
  return out.length ? out : null;
}

// ---------- Registro público ----------

export function getRules(): (Rule & { enabled: boolean; lastRunAt?: string })[] {
  const overrides = getRuleOverrides();
  return RULES.map((r) => ({
    ...r,
    enabled: overrides[r.id]?.enabled ?? true,
    lastRunAt: overrides[r.id]?.lastRunAt,
  }));
}

// ---------- Execução do motor ----------

export interface RunResult {
  createdCount: number;
  updatedCount: number;
  resolvedCount: number;
  totalActive: number;
}

export function runInsightsEngine(): RunResult {
  const now = new Date();
  const ctx: RuleContext = {
    now,
    leads: getLeads(),
    meetings: getMeetings(),
    events: getMovementEvents(),
    sessions: getSessions(),
    transactions: getTransactions(),
    reminders: getReminders(),
    callLogs: getCallLogs(),
    tasks: getTasks(),
    goals: getGoalsSettings(),
  };

  const overrides = getRuleOverrides();
  const existing = getInsights();
  const byCause = new Map(existing.filter((i) => i.status === "active").map((i) => [i.causeKey, i]));
  const stillActive = new Set<string>();
  let created = 0, updated = 0;

  for (const rule of RULES) {
    if (overrides[rule.id]?.enabled === false) continue;
    let gens: GeneratedInsight[] | null = null;
    try { gens = rule.evaluate(ctx); } catch (e) { console.error("Rule failed:", rule.id, e); continue; }
    if (!gens || gens.length === 0) { markLastRun(overrides, rule.id, now); continue; }
    for (const g of gens) {
      stillActive.add(g.causeKey);
      const prev = byCause.get(g.causeKey);
      if (prev) {
        Object.assign(prev, {
          title: g.title, description: g.description, reason: g.reason,
          suggestion: g.suggestion, priority: g.priority, category: g.category,
          confidence: g.confidence, updatedAt: now.toISOString(), status: "active" as const,
          resolvedAt: undefined,
        });
        updated++;
      } else {
        existing.push({
          id: crypto.randomUUID(), ruleId: rule.id,
          ...g, createdAt: now.toISOString(), updatedAt: now.toISOString(), status: "active",
        });
        created++;
      }
    }
    markLastRun(overrides, rule.id, now);
  }

  // Resolve insights ativos que não voltaram a aparecer nesta execução
  let resolved = 0;
  for (const i of existing) {
    if (i.status === "active" && !stillActive.has(i.causeKey)) {
      i.status = "resolved";
      i.resolvedAt = now.toISOString();
      i.updatedAt = now.toISOString();
      resolved++;
    }
  }

  saveInsights(existing);
  save(OVERRIDES_KEY, overrides);
  save(LAST_RUN_KEY, now.toISOString());

  return {
    createdCount: created, updatedCount: updated, resolvedCount: resolved,
    totalActive: existing.filter((i) => i.status === "active").length,
  };
}

function markLastRun(overrides: OverridesMap, ruleId: string, now: Date) {
  overrides[ruleId] = { ...(overrides[ruleId] || { enabled: true }), lastRunAt: now.toISOString() };
}

// ---------- Ordenação ----------
const PRIORITY_ORDER: Record<InsightPriority, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
export function sortInsights(list: Insight[]): Insight[] {
  return [...list].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  cidade: "Cidade", nicho: "Nicho", campanha: "Campanha", script: "Script",
  horario: "Horário", produtividade: "Produtividade", funil: "Funil",
  metas: "Metas", pipeline: "Pipeline", comercial: "Comercial",
  financeiro: "Financeiro", crm: "CRM",
};
export const PRIORITY_LABELS: Record<InsightPriority, string> = {
  critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa",
};
