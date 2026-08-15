// ===== Event Wiring =====
// Assina os eventos do bus e dispara os efeitos colaterais transversais:
//  • grava histórico cronológico do lead
//  • dispara um `storage` sintético + `p21:storage-synced` para que painéis
//    já existentes (HeaderStats, ColdCallOps, Dashboard, Metas etc.) recalculem
//    sem exigir botão de atualizar/sincronizar.
//
// Nada aqui altera o comportamento dos módulos — apenas propaga sinais.

import { onAny, on } from "@/shared/services/eventBus";
import { appendHistory } from "@/shared/services/history";
import { recordActivity, channelFromLabel } from "@/shared/services/activityLedger";
import { extractMemoryFromLead } from "@/modules/intelligence/services/commercialMemory";
import { getLeads } from "@/shared/services/store";

let installed = false;

function broadcastRefresh() {
  if (typeof window === "undefined") return;
  // Componentes existentes (HeaderStatsWidget, ColdCallOpsPanel) já escutam
  // `storage`. Disparamos manualmente pois writes na mesma aba não emitem.
  try { window.dispatchEvent(new Event("storage")); } catch {}
  try { window.dispatchEvent(new Event("p21:storage-synced")); } catch {}
}

// Coalesce refresh broadcasts: várias mutações em sequência viram um único tick.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    broadcastRefresh();
  }, 60);
}

export function installEventWiring() {
  if (installed) return;
  installed = true;

  // Qualquer evento → broadcast leve para os observadores existentes.
  onAny(() => scheduleRefresh());

  // ===== Ledger de atividade (somente fontes confirmadas) =====
  // Eventos inferidos (movimentação de card, tentativa concluída, nota, clique
  // em WhatsApp) NÃO alimentam mais nenhuma métrica comercial.

  on("InteracaoRegistrada", (ev: any) => {
    const { leadId, interactionType, date } = ev.payload || {};
    if (!leadId) return;
    recordActivity({
      leadId,
      channel: channelFromLabel(interactionType),
      source: "interaction",
      at: date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : undefined,
    });
  });

  on("InteracaoRegistrada", (ev: any) => {
    const { leadId, company, interactionType } = ev.payload || {};
    appendHistory({
      leadId,
      type: "InteracaoRegistrada",
      label: `Interação registrada${interactionType ? ` · ${interactionType}` : ""}`,
      detail: company,
    });
  });

  on("ReuniaoMarcada", (ev: any) => {
    if (!ev.payload?.leadId) return;
    recordActivity({ leadId: ev.payload.leadId, channel: "meeting", source: "meeting" });
  });

  // Histórico cronológico ————————————————————————————————
  on("LeadMovido", (ev: any) => {
    const { leadId, company, fromStage, toStage } = ev.payload || {};
    appendHistory({
      leadId,
      type: "LeadMovido",
      label: `Lead movido para "${toStage}"`,
      detail: [company, fromStage ? `de "${fromStage}"` : null].filter(Boolean).join(" · "),
    });
  });

  on("LigacaoRegistrada", (ev: any) => {
    const { leadId, company, stage } = ev.payload || {};
    appendHistory({
      leadId,
      type: "LigacaoRegistrada",
      label: "Ligação realizada",
      detail: [company, stage].filter(Boolean).join(" · "),
    });
  });

  on("MensagemRegistrada", (ev: any) => {
    const { leadId, company, stage } = ev.payload || {};
    appendHistory({
      leadId,
      type: "MensagemRegistrada",
      label: "Mensagem registrada",
      detail: [company, stage].filter(Boolean).join(" · "),
    });
  });

  on("ReuniaoMarcada", (ev: any) => {
    const { leadId, company, date, time, source } = ev.payload || {};
    appendHistory({
      leadId,
      type: "ReuniaoMarcada",
      label: "Reunião marcada",
      detail: [company, date && time ? `${date} ${time}` : null, source].filter(Boolean).join(" · "),
    });
  });

  on("ReuniaoAtualizada", (ev: any) => {
    const { leadId, company, date, time } = ev.payload || {};
    appendHistory({
      leadId,
      type: "ReuniaoAtualizada",
      label: "Reunião reagendada",
      detail: [company, date && time ? `${date} ${time}` : null].filter(Boolean).join(" · "),
    });
  });

  on("ReuniaoRealizada", (ev: any) => {
    const { leadId, company } = ev.payload || {};
    appendHistory({ leadId, type: "ReuniaoRealizada", label: "Reunião realizada", detail: company });
  });

  on("VendaRealizada", (ev: any) => {
    const { leadId, company, amount } = ev.payload || {};
    appendHistory({
      leadId,
      type: "VendaRealizada",
      label: "Venda registrada",
      detail: [company, amount ? `R$ ${amount.toLocaleString("pt-BR")}` : null].filter(Boolean).join(" · "),
    });
  });

  on("OnboardingIniciado", (ev: any) => {
    const { leadId, company } = ev.payload || {};
    appendHistory({ leadId, type: "OnboardingIniciado", label: "Onboarding iniciado", detail: company });
  });

  on("PomodoroFinalizado", (ev: any) => {
    const { durationMinutes, niche } = ev.payload || {};
    appendHistory({
      type: "PomodoroFinalizado",
      label: `Pomodoro de ${durationMinutes ?? "?"}min concluído`,
      detail: niche || undefined,
    });
  });

  on("FinanceiroAtualizado", (ev: any) => {
    const { clientId, clientName, amount } = ev.payload || {};
    appendHistory({
      leadId: clientId,
      type: "FinanceiroAtualizado",
      label: "Receita registrada",
      detail: [clientName, amount ? `R$ ${amount.toLocaleString("pt-BR")}` : null].filter(Boolean).join(" · "),
    });
  });

  // ===== Memória Comercial =====
  // Ganho => padrão de vitória
  on("VendaRealizada", (ev: any) => {
    try {
      const leadId = ev.payload?.leadId;
      if (!leadId) return;
      const lead = getLeads().find((l) => l.id === leadId);
      if (lead) extractMemoryFromLead("won_pattern", lead, `Contrato fechado. Valor: R$ ${ev.payload?.amount ?? "N/D"}.`);
    } catch (e) { console.warn("[memory won]", (e as Error).message); }
  });

  // Perdido => padrão de perda (detectado por LeadMovido para etapas de perda)
  on("LeadMovido", (ev: any) => {
    try {
      const to: string = ev.payload?.toStage || "";
      if (!/não quer|perdido|sem contato/i.test(to)) return;
      const leadId = ev.payload?.leadId;
      if (!leadId) return;
      const lead = getLeads().find((l) => l.id === leadId);
      if (lead) extractMemoryFromLead("lost_pattern", lead, `Lead movido para "${to}".`);
    } catch (e) { console.warn("[memory lost]", (e as Error).message); }
  });
}
