// Priority Leads — construção de candidatos + chamada da IA.
// Envia à Edge Function `priority-leads-ia` uma lista COMPACTA de leads
// com sinais operacionais (evita expor payloads gigantes e reduz tokens).

import { supabase } from "@/integrations/supabase/client";
import { uload, usave } from "@/shared/services/userStorage";
import { getLeads, type Lead, type CallAuditData } from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import { getTasksByLead } from "@/modules/leads/services/leadTasks";

export const CACHE_KEY = "p21_priority_leads_cache";
const TTL_MS = 30 * 60_000; // 30 min

export interface PriorityLeadPick {
  leadId: string;
  motivo: string;
  proximaAcao: string;
  impacto: "critico" | "alto" | "medio";
  nextBestAction?: import("@/modules/intelligence/services/nextBestAction").NextBestAction;
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

// Constrói candidatos com contexto ultra-detalhado para análise da IA.
// SPRINT - Otimização da Análise: Ignora etapas sem interação comercial inicial
export function buildCandidates(): Candidate[] {
  const now = Date.now();
  const leads = getLeads();
  const reminders = getReminders();
  const CLOSED = new Set(["Ganho", "Perdido"]);
  
  // Etapas a serem ignoradas (sem histórico comercial relevante para priorização de Missão)
  const IGNORE_STAGES = new Set(["Novos Leads", "Importados"]);

  const remByLead = new Map<string, typeof reminders>();
  for (const r of reminders) {
    if (!remByLead.has(r.leadId)) remByLead.set(r.leadId, []);
    remByLead.get(r.leadId)!.push(r);
  }

  // ETAPA 1 — Buscar apenas oportunidades ativas (que não estejam em IGNORE_STAGES)
  let candidatesLeads = leads.filter(l => !CLOSED.has(l.stage) && !IGNORE_STAGES.has(l.stage));

  // Caso especial: se não houver NENHUM lead nas etapas avançadas, recorre aos leads ativos gerais (fallback)
  if (candidatesLeads.length === 0) {
    candidatesLeads = leads.filter(l => !CLOSED.has(l.stage));
  }

  const cands: Candidate[] = [];

  for (const l of candidatesLeads) {

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
    const fHoje = rems.filter((r) => r.status === "pending" && new Date(r.scheduledFor).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

    const tasks = getTasksByLead(l.id);
    const tVencidas = tasks.filter((t) => t.status === "pendente" && new Date(t.dueAt).getTime() < now).length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const tHoje = tasks.filter((t) => t.status === "pendente" && t.dueAt.slice(0, 10) === todayStr).length;

    // Heurística de pré-score para filtragem inicial
    // SPRINT - Correção do Motor: Não descarta nenhum lead que tenha ações pendentes ou seja quente.
    let pre = 0;
    
    if (fVencidos > 0) pre += 100 + fVencidos * 10;
    if (fHoje > 0) pre += 80;
    if (tVencidas > 0) pre += 60;
    if (tHoje > 0) pre += 40;
    if (diasSemInteracao > 7) pre += 30; // Lead parado

    if (audit) {
      if (typeof audit.scoreComercial === "number") pre += audit.scoreComercial / 2;
      if (audit.prioridade === "Alta") pre += 40;
      if (audit.temperatura === "Quente") pre += 50;
    }

    if (l.stage === "Proposta" || l.stage === "Negociação") pre += 50;
    if (l.stage === "Reunião Agendada" || l.stage === "Reunião Realizada") pre += 40;
    if (l.stage === "Diagnóstico") pre += 30;
    if ((l.contractValue || 0) > 0) pre += Math.min(30, (l.contractValue! / 500));

    // Força a inclusão se houver sinais críticos, mesmo que a pontuação base seja baixa
    const hasCriticalSignal = fVencidos > 0 || fHoje > 0 || tVencidas > 0 || (audit?.temperatura === "Quente" && diasSemInteracao > 2);
    
    if (pre < 5 && !hasCriticalSignal) continue; 


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
      contractValue: l.contractValue,
      interacoes: interactions.length + callNotes.length,
      followupsVencidos: fVencidos,
      followupsHoje: fHoje,
      tarefasVencidas: tVencidas,
      tarefasHoje: tHoje,
      ultimaInteracao: lastInt
        ? { tipo: lastInt.type, resumo: (lastInt.summary || "").slice(0, 400), data: lastInt.date }
        : undefined,
      // SPRINT 4: Envio de contexto bruto para que a IA processe a semântica
      notasVendedor: (l.notes || "").slice(0, 1000),
      diagnosticoHistorico: (l.diagnosisHistory || []).map(h => h.diagnosis.summary).join(" | ").slice(0, 1000),
      interacoesRecentes: interactions.slice(-3).map(i => `${i.type}: ${i.summary}`).join(" | "),
      sinaisIA: [],
      _prescore: pre,
    } as any);
  }

  cands.sort((a, b) => b._prescore - a._prescore);
  return cands.slice(0, 40);
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
  
  // SPRINT 2: Limpa a missão atual antes de processar a nova priorização para garantir fluxo de lote
  const { resetMissionDay } = await import("./missionStore");
  resetMissionDay();

  const { data, error } = await supabase.functions.invoke("priority-leads-ia", {
    body: { candidates: payload },
  });
  if (error) {
    let details = error.message;
    let code = "UNKNOWN";
    let status = 500;
    
    try {
      // @ts-ignore - Extraindo detalhes do erro da Edge Function do Supabase
      if (error.context) {
        status = error.context.status || 500;
        const text = await error.context.text();
        try {
          const parsed = JSON.parse(text);
          details = parsed.message || parsed.error || details;
          code = parsed.code || code;
        } catch {
          details = text || details;
        }
      }
    } catch { /* noop */ }

    const diagnostic = `[Edge Function: priority-leads-ia]
Código HTTP: ${status}
Erro: ${details}
Código Técnico: ${code}
Etapa Provável: Chamada da API / Gateway de IA`;

    throw new Error(diagnostic);
  }

  const leads: PriorityLeadPick[] = Array.isArray((data as any)?.leads) ? (data as any).leads : [];
  
  // SPRINT - Interface exibe apenas a maior prioridade. 
  // O backend já retorna 1, mas garantimos aqui no cliente também.
  const result: PriorityLeadsCache = {
    generatedAt: new Date().toISOString(),
    model: (data as any)?.model,
    leads: leads.slice(0, 1), 
    fingerprint: fp,
  };
  saveCache(result);
  return result;
}
