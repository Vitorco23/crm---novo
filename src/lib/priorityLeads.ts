// Priority Leads — construção de candidatos + chamada da IA.
// Envia à Edge Function `priority-leads-ia` uma lista COMPACTA de leads
// com sinais operacionais (evita expor payloads gigantes e reduz tokens).

import { supabase } from "@/integrations/supabase/client";
import { uload, usave } from "./userStorage";
import { getLeads, type Lead, type CallAuditData } from "./store";
import { getReminders } from "./reminders";
import { getTasksByLead } from "./leadTasks";

export const CACHE_KEY = "p21_priority_leads_cache";
const TTL_MS = 30 * 60_000; // 30 min

export interface PriorityLeadPick {
  leadId: string;
  motivo: string;
  proximaAcao: string;
  impacto: "critico" | "alto" | "medio";
}

export interface PriorityLeadsCache {
  generatedAt: string;
  model?: string;
  leads: PriorityLeadPick[];
  fingerprint: string;
}

// Assinatura simples do estado atual — evita re-chamar IA sem mudanças.
function fingerprint(): string {
  const leads = getLeads();
  const rems = getReminders();
  const sig = leads.map((l) => `${l.id}:${l.stage}:${l.stageChangedAt}:${l.temperature ?? ""}`).join("|");
  return `${leads.length}#${rems.length}#${hash(sig)}`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

function daysSince(iso?: string): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 999;
  return Math.floor((Date.now() - t) / 86400000);
}

function latestAudit(l: Lead): CallAuditData | null {
  const notes = l.callNotes || [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const a = notes[i]?.analysis?.data;
    if (a) return a;
  }
  return null;
}

interface Candidate {
  id: string;
  empresa: string;
  etapa: string;
  diasNaEtapa: number;
  diasDesdeUltimaInteracao: number;
  temperatura?: string;
  score?: number;
  tendencia?: string;
  probabilidade?: string;
  prioridadeAudit?: string;
  proximaAcaoAudit?: string;
  principalObjecao?: string;
  contractValue?: number;
  reunioesMarcadas: number;
  interacoes: number;
  followupsVencidos: number;
  followupsPendentes: number;
  tarefasVencidas: number;
  tarefasHoje: number;
  ultimaInteracao?: { tipo: string; resumo: string; data: string };
  sinais: string[];
  _prescore: number; // heurística usada só para pré-filtrar
}

// Constrói até 25 candidatos com maior "atenção potencial".
export function buildCandidates(): Candidate[] {
  const now = Date.now();
  const leads = getLeads();
  const reminders = getReminders();
  const CLOSED = new Set(["Ganho", "Perdido"]);

  const remByLead = new Map<string, typeof reminders>();
  for (const r of reminders) {
    if (!remByLead.has(r.leadId)) remByLead.set(r.leadId, []);
    remByLead.get(r.leadId)!.push(r);
  }

  const cands: Candidate[] = [];

  for (const l of leads) {
    if (CLOSED.has(l.stage)) continue;

    const audit = latestAudit(l);
    const interactions = l.interactions || [];
    const callNotes = l.callNotes || [];
    const lastInteractionISO =
      [
        ...interactions.map((i) => i.date || i.createdAt),
        ...callNotes.map((c) => c.createdAt),
      ].sort().pop() || l.stageChangedAt;

    const diasNaEtapa = daysSince(l.stageChangedAt);
    const diasSemInteracao = daysSince(lastInteractionISO);

    const rems = remByLead.get(l.id) || [];
    const fVencidos = rems.filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() < now).length;
    const fPendentes = rems.filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() >= now).length;

    const tasks = getTasksByLead(l.id);
    const tVencidas = tasks.filter((t) => t.status === "pendente" && new Date(t.dueAt).getTime() < now).length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const tHoje = tasks.filter((t) => t.status === "pendente" && t.dueAt.slice(0, 10) === todayStr).length;

    // Heurística de pré-score (só decide QUEM vai pra IA)
    let pre = 0;
    const sinais: string[] = [];

    if (fVencidos > 0) { pre += 40 + fVencidos * 10; sinais.push(`${fVencidos} follow-up(s) vencido(s)`); }
    if (tVencidas > 0) { pre += 25 + tVencidas * 5; sinais.push(`${tVencidas} tarefa(s) vencida(s)`); }
    if (tHoje > 0) { pre += 15; sinais.push(`${tHoje} tarefa(s) para hoje`); }

    if (audit) {
      if (typeof audit.scoreComercial === "number") pre += Math.min(30, audit.scoreComercial / 3);
      if (audit.prioridade === "Alta") { pre += 25; sinais.push("prioridade Alta na última análise"); }
      if (audit.probabilidadeAvanco === "Alta") { pre += 15; sinais.push("alta probabilidade de avanço"); }
      if (audit.tendencia === "Esfriando") { pre += 30; sinais.push("tendência: esfriando"); }
      if (audit.tendencia === "Evoluindo") { pre += 10; sinais.push("tendência: evoluindo"); }
      if (audit.temperatura === "Quente") { pre += 20; sinais.push("lead quente"); }
      if (audit.dataProximoContato) {
        const dd = daysSince(audit.dataProximoContato);
        if (dd >= 0) { pre += 20 + dd * 5; sinais.push(`próximo contato agendado atrasado ${dd}d`); }
      }
    } else if (l.temperature === "Quente") {
      pre += 12; sinais.push("marcado como quente");
    }

    // Etapas críticas
    if (l.stage === "Proposta Enviada" && diasNaEtapa >= 2) { pre += 20 + diasNaEtapa * 2; sinais.push(`proposta parada ${diasNaEtapa}d`); }
    if (l.stage === "Documento de Guerra") { pre += 18; sinais.push("aguardando diagnóstico"); }
    if (l.stage === "Reunião Marcada") { pre += 8; }
    if (l.stage === "Reunião Realizada" && diasNaEtapa >= 3) { pre += 15 + diasNaEtapa; sinais.push(`sem follow-up pós-reunião há ${diasNaEtapa}d`); }
    if (diasSemInteracao >= 7 && (l.contractValue || 0) > 0) { pre += 10 + Math.min(20, diasSemInteracao); sinais.push(`${diasSemInteracao}d sem interação`); }

    // Valor de contrato dá peso quando há oportunidade real
    if ((l.contractValue || 0) > 0) pre += Math.min(15, Math.log10(l.contractValue!) * 3);

    if (pre < 15) continue; // ignora leads sem sinal significativo

    const lastInt = interactions[interactions.length - 1] || null;

    cands.push({
      id: l.id,
      empresa: l.company,
      etapa: l.stage,
      diasNaEtapa,
      diasDesdeUltimaInteracao: diasSemInteracao,
      temperatura: audit?.temperatura || l.temperature,
      score: audit?.scoreComercial,
      tendencia: audit?.tendencia,
      probabilidade: audit?.probabilidadeAvanco,
      prioridadeAudit: audit?.prioridade,
      proximaAcaoAudit: audit?.proximaAcao,
      principalObjecao: audit?.principalObjecao,
      contractValue: l.contractValue,
      reunioesMarcadas: interactions.filter((i) => /reuni/i.test(i.type)).length,
      interacoes: interactions.length + callNotes.length,
      followupsVencidos: fVencidos,
      followupsPendentes: fPendentes,
      tarefasVencidas: tVencidas,
      tarefasHoje: tHoje,
      ultimaInteracao: lastInt
        ? { tipo: lastInt.type, resumo: (lastInt.summary || "").slice(0, 180), data: lastInt.date }
        : undefined,
      sinais: sinais.slice(0, 6),
      _prescore: pre,
    });
  }

  cands.sort((a, b) => b._prescore - a._prescore);
  return cands.slice(0, 25);
}

export function getCache(): PriorityLeadsCache | null {
  return uload<PriorityLeadsCache | null>(CACHE_KEY, null);
}

export function saveCache(c: PriorityLeadsCache) {
  usave(CACHE_KEY, c);
  try { window.dispatchEvent(new Event("p21:priority-leads-updated")); } catch { /* noop */ }
}

export function isCacheFresh(c: PriorityLeadsCache | null): boolean {
  if (!c) return false;
  const age = Date.now() - new Date(c.generatedAt).getTime();
  if (age > TTL_MS) return false;
  return c.fingerprint === fingerprint();
}

export async function computePriorityLeads(force = false): Promise<PriorityLeadsCache> {
  const cache = getCache();
  if (!force && isCacheFresh(cache)) return cache!;

  const cands = buildCandidates();
  const fp = fingerprint();

  if (cands.length === 0) {
    const empty: PriorityLeadsCache = {
      generatedAt: new Date().toISOString(),
      leads: [],
      fingerprint: fp,
    };
    saveCache(empty);
    return empty;
  }

  // Remove o campo interno _prescore antes de enviar.
  const payload = cands.map(({ _prescore, ...rest }) => rest);
  const { data, error } = await supabase.functions.invoke("priority-leads-ia", {
    body: { candidates: payload },
  });
  if (error) {
    let details = error.message;
    try { // @ts-ignore
      if (error.context?.text) details = await error.context.text();
    } catch { /* noop */ }
    throw new Error(details || "Falha ao calcular prioridades");
  }

  const leads: PriorityLeadPick[] = Array.isArray((data as any)?.leads) ? (data as any).leads : [];
  const result: PriorityLeadsCache = {
    generatedAt: new Date().toISOString(),
    model: (data as any)?.model,
    leads,
    fingerprint: fp,
  };
  saveCache(result);
  return result;
}
