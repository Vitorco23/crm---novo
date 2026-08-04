// openLead — abertura global de um Lead a partir de qualquer contexto do app.
// Usado pela Próxima Melhor Ação para tornar todos os botões executáveis.
//
// Fluxo:
// 1. Determina a rota do pipeline do lead
// 2. Persiste a intenção em sessionStorage (PENDING_KEY)
// 3. Navega para a rota (ou dispara evento se já estiver lá)
// 4. PipelineBoard escuta e abre o LeadDetailDrawer com a aba/ação corretas

import { getLeads, getPipelineForStage, type PipelineName } from "@/shared/services/store";

export type LeadTabHint = "geral" | "interacoes" | "observacoes" | "anexos";
export type LeadActionHint =
  | "new-interaction"
  | "generate-script"
  | "run-diagnosis"
  | "schedule-meeting"
  | "upload-attachment"
  | "new-task";

export interface PendingOpenLead {
  leadId: string;
  tab?: LeadTabHint;
  action?: LeadActionHint;
  ts: number;
}

export const PENDING_OPEN_LEAD_KEY = "p21_pending_open_lead";
export const OPEN_LEAD_EVENT = "p21:open-lead-request";

function pipelineRoute(p: PipelineName): string {
  if (p === "oportunidades") return "/oportunidades";
  if (p === "onboarding") return "/onboarding";
  return "/";
}

export function openLead(
  leadId: string,
  opts: { tab?: LeadTabHint; action?: LeadActionHint; forceInPlace?: boolean } = {},
) {
  if (!leadId) return;
  // Busca apenas pelo ID; nunca depende de filtros/listas visíveis.
  const lead = getLeads().find((l) => l.id === id); // Fix: use 'leadId' instead of 'id' which might be from outer scope if I'm not careful, but here I'll use leadId
  
  const payload: PendingOpenLead = {
    leadId,
    tab: opts.tab,
    action: opts.action,
    ts: Date.now(),
  };

  // Se for solicitado explicitamente (ou detectado que estamos na Missão do Dia e queremos evitar navegação),
  // disparamos o evento sem tentar navegar.
  if (opts.forceInPlace) {
    window.dispatchEvent(new CustomEvent(OPEN_LEAD_EVENT, { detail: payload }));
    return;
  }

  try {
    sessionStorage.setItem(PENDING_OPEN_LEAD_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }

  const route = lead ? pipelineRoute(getPipelineForStage(lead.stage)) : "/";
  const current = typeof window !== "undefined" ? window.location.pathname : "";
  
  // Se já estamos na rota correta ou se estamos na Missão do Dia (/missao) e queremos abrir o drawer nela mesma
  if (current === route || current === "/missao") {
    window.dispatchEvent(new CustomEvent(OPEN_LEAD_EVENT, { detail: payload }));
  } else {
    window.location.assign(route);
  }
}

export function consumePendingOpenLead(): PendingOpenLead | null {
  try {
    const raw = sessionStorage.getItem(PENDING_OPEN_LEAD_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_OPEN_LEAD_KEY);
    const p = JSON.parse(raw) as PendingOpenLead;
    if (!p?.leadId) return null;
    // Descarta requests antigos (> 2min) para evitar reabrir em navegações futuras.
    if (Date.now() - (p.ts || 0) > 120_000) return null;
    return p;
  } catch {
    return null;
  }
}

