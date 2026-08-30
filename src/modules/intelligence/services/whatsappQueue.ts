// Fila diária de WhatsApp (número pessoal, DDD 79) — Parte 3 do pedido de
// follow-up manual. Trava até 25 leads/dia numa janela fixa de fim de dia
// (18h+ horário de Brasília), evitando reavaliação em tempo real (a lista
// não pode mudar embaixo do vendedor enquanto ele está mandando mensagem).
//
// Sem cron no projeto (confirmado — nenhum pg_cron/agendamento de function
// existe hoje, e aplicar isso via migration está fora do nosso acesso
// direto ao Supabase). Gatilho é client-side: shouldGenerateNewQueue()
// decide, toda vez que a tela é aberta, se já passou da hora e a lista de
// hoje ainda não existe — se sim, calcula e trava ali. Antes da janela,
// buildDraftPreview() mostra candidatos locais (sem custo de IA) rotulados
// como rascunho, nunca como decisão final.
//
// A lista travada permanece válida até a PRÓXIMA janela gerar uma nova —
// nunca expira nem recalcula sozinha de madrugada (o vendedor pode mandar
// mensagens à noite E na manhã seguinte a partir da mesma lista).

import { supabase } from "@/integrations/supabase/client";
import { uload, usave } from "@/shared/services/userStorage";
import {
  getLeads,
  getPipelineForStage,
  type Lead,
  type CallAuditData,
  type PipelineStage,
} from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import { getActivityLedger, type ActivityEvent } from "@/shared/services/activityLedger";
import { renderReminderTemplate } from "@/modules/agenda/services/reminders";
import { buildWaLink, leadWhatsappPhone } from "@/shared/services/whatsappLink";
import { COLD_CALL_WHATSAPP_MESSAGES, findColdCallMessage } from "@/modules/cold-call/services/whatsappColdCallMessages";

export const DAILY_LIMIT = 25;
/** Hora local (America/Sao_Paulo) a partir da qual a fila do dia pode travar. Ajustável. */
export const LOCK_HOUR = 18;

const STATE_KEY = "p21_whatsapp_daily_queue";
export const WHATSAPP_QUEUE_UPDATED_EVENT = "p21:whatsapp-queue-updated";

function notify() {
  try { window.dispatchEvent(new CustomEvent(WHATSAPP_QUEUE_UPDATED_EVENT)); } catch { /* ignore */ }
}

function todayKeySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function hourSP(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", hour12: false,
  }).format(now));
}

function daysSince(iso: string | undefined, nowMs: number): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

function latestCallAudit(lead: Lead): CallAuditData | null {
  const notes = lead.callNotes || [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const data = notes[i]?.analysis?.data;
    if (data) return data;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface QueueCandidate {
  id: string;
  empresa: string;
  etapa: string;
  diasNaEtapa: number;
  temperatura?: string;
  score?: number;
  probabilidade?: number;
  tendencia?: string;
  /** O sinal mais importante para a Parte 3: o CONTEÚDO da ligação, não só a etapa. */
  resumoLigacao?: string;
  proximaAcaoSugerida?: string;
  principalObjecao?: string;
  contractValue?: number;
  followupsVencidos: number;
  /** Atividade de ligação de HOJE para este lead — null se não foi ligado hoje. */
  ligacaoHoje: { outcome: string; talkedTo?: string; tentativaHoje: number } | null;
  _prescore: number;
}

export interface WhatsAppQueueItem {
  leadId: string;
  empresa: string;
  tier: 1 | 2 | 3 | 4 | 5;
  motivo: string;
  /** Id de uma das 8 mensagens de cold call, quando a IA sugeriu uma. */
  mensagemId: string | null;
  mensagem: string;
  waLink: string | null;
  contactedAt: string | null;
}

export interface WhatsAppQueueState {
  /** Dia (America/Sao_Paulo) em que esta lista foi gerada/travada. */
  date: string;
  status: "locked";
  generatedAt: string;
  model?: string;
  limit: number;
  items: WhatsAppQueueItem[];
}

export interface DraftPreviewItem {
  leadId: string;
  empresa: string;
  etapa: string;
  motivoRascunho: string;
}

// ---------------------------------------------------------------------------
// Construção de candidatos (client-side, sem custo de IA)
// ---------------------------------------------------------------------------

/** Constrói o pool amplo de candidatos do dia — bem mais generoso que os 25
 * finais, pra IA ter margem real de escolha. Inclui: leads ligados hoje
 * (qualquer desfecho) + leads em etapas pós-cold-call com sinal de urgência. */
export function buildQueueCandidates(now: Date = new Date()): QueueCandidate[] {
  const leads = getLeads();
  const ledger = getActivityLedger();
  const reminders = getReminders().filter((r) => r.status === "pending");
  const today = todayKeySP(now);
  const nowMs = now.getTime();
  const CLOSED = new Set(["Ganho", "Perdido"]);

  const callsTodayByLead = new Map<string, ActivityEvent[]>();
  for (const e of ledger) {
    if (e.channel !== "call" || !e.leadId) continue;
    if (todayKeySP(new Date(e.at)) !== today) continue;
    if (!callsTodayByLead.has(e.leadId)) callsTodayByLead.set(e.leadId, []);
    callsTodayByLead.get(e.leadId)!.push(e);
  }

  const remindersByLead = new Map<string, number>();
  for (const r of reminders) {
    if (new Date(r.scheduledFor).getTime() >= nowMs) continue; // só vencidos
    remindersByLead.set(r.leadId, (remindersByLead.get(r.leadId) || 0) + 1);
  }

  const candidates: QueueCandidate[] = [];

  for (const l of leads) {
    if (CLOSED.has(l.stage)) continue;

    const callsToday = callsTodayByLead.get(l.id) || [];
    const isOpportunityStage = getPipelineForStage(l.stage as PipelineStage) !== "cold_call";
    const audit = latestCallAudit(l);
    const diag = l.autoDiagnosis;

    if (callsToday.length === 0 && !isOpportunityStage && !audit && !diag) continue;

    const lastCallToday = callsToday[callsToday.length - 1];
    const diasNaEtapa = daysSince(l.stageChangedAt, nowMs);
    const followupsVencidos = remindersByLead.get(l.id) || 0;

    // Pré-score local: só decide quem entra no pool enviado à IA — a
    // classificação final em faixas 1-5 e a ordenação por conteúdo são
    // trabalho da IA, não desta heurística.
    let pre = 0;
    if (lastCallToday) {
      if (lastCallToday.outcome === "pediu_retorno" && lastCallToday.talkedTo === "decisor") pre += 45;
      else if (lastCallToday.outcome === "agendou") pre += 40;
      else if (lastCallToday.outcome === "sem_interesse") pre += 5;
      else if (lastCallToday.outcome === "contato_invalido") pre += 15; // vale mensagem de correção
      else if (callsToday.length === 1) pre += 25; // 1ª tentativa sem atender
      else pre += 10; // 2ª+ tentativa sem atender
    }
    if (/reuni.*marcada/i.test(l.stage)) pre += 20;
    if (/no-?show/i.test(l.stage)) pre += 30;
    if (audit?.probabilidadeAvanco === "Alta") pre += 20;
    if (audit?.tendencia === "Esfriando") pre += 15;
    if (diag?.temperature === "quente") pre += 15;
    pre += Math.min(15, followupsVencidos * 8);
    if ((l.contractValue || 0) > 0) pre += Math.min(10, Math.log10(l.contractValue!) * 2);

    candidates.push({
      id: l.id,
      empresa: l.company,
      etapa: l.stage,
      diasNaEtapa,
      temperatura: audit?.temperatura || diag?.temperature || l.temperature,
      score: audit?.scoreComercial,
      probabilidade: diag?.probability,
      tendencia: audit?.tendencia,
      resumoLigacao: (audit?.resumoExecutivo || diag?.summary || "").slice(0, 400),
      proximaAcaoSugerida: audit?.proximaAcao || diag?.next_action,
      principalObjecao: audit?.principalObjecao,
      contractValue: l.contractValue,
      followupsVencidos,
      ligacaoHoje: lastCallToday
        ? { outcome: lastCallToday.outcome || "outro", talkedTo: lastCallToday.talkedTo, tentativaHoje: callsToday.length }
        : null,
      _prescore: pre,
    });
  }

  candidates.sort((a, b) => b._prescore - a._prescore);
  return candidates.slice(0, 60); // pool generoso — a IA escolhe os 25 finais
}

/** Pré-visualização antes da janela travar — SEM chamada de IA (custo zero),
 * rótulo deixa claro que é rascunho, nunca lista final. */
export function buildDraftPreview(now: Date = new Date()): DraftPreviewItem[] {
  return buildQueueCandidates(now)
    .slice(0, DAILY_LIMIT)
    .map((c) => ({
      leadId: c.id,
      empresa: c.empresa,
      etapa: c.etapa,
      motivoRascunho: c.ligacaoHoje
        ? `Ligado hoje — ${c.ligacaoHoje.outcome}`
        : `${c.etapa} há ${c.diasNaEtapa}d`,
    }));
}

// ---------------------------------------------------------------------------
// Estado persistido + gatilho da janela
// ---------------------------------------------------------------------------

export function getQueueState(): WhatsAppQueueState | null {
  return uload<WhatsAppQueueState | null>(STATE_KEY, null);
}

function saveQueueState(state: WhatsAppQueueState) {
  usave(STATE_KEY, state);
  notify();
}

/** true quando é hora de (re)calcular e travar a lista do dia. */
export function shouldGenerateNewQueue(state: WhatsAppQueueState | null, now: Date = new Date()): boolean {
  const today = todayKeySP(now);
  if (state?.date === today) return false; // já travado hoje
  return hourSP(now) >= LOCK_HOUR;
}

export interface GenerateQueueResult {
  ok: boolean;
  state?: WhatsAppQueueState;
  errorMessage?: string;
}

/** Roda a IA (GPT-5.4-mini, mesma persona "Diretor Comercial" já usada em
 * priority-leads-ia) e trava a lista do dia. Chamar só quando
 * shouldGenerateNewQueue() for true (ou com force=true, ex.: botão manual). */
export async function generateAndLockQueue(force = false, now: Date = new Date()): Promise<GenerateQueueResult> {
  const state = getQueueState();
  if (!force && !shouldGenerateNewQueue(state, now)) {
    return { ok: false, errorMessage: "Ainda não é hora da janela de priorização (18h)." };
  }

  const candidates = buildQueueCandidates(now);
  if (candidates.length === 0) {
    const empty: WhatsAppQueueState = {
      date: todayKeySP(now),
      status: "locked",
      generatedAt: now.toISOString(),
      limit: DAILY_LIMIT,
      items: [],
    };
    saveQueueState(empty);
    return { ok: true, state: empty };
  }

  const payload = candidates.map(({ _prescore, ...rest }) => rest);
  const { data, error } = await supabase.functions.invoke("whatsapp-queue-ia", {
    body: { candidates: payload, messages: COLD_CALL_WHATSAPP_MESSAGES.map((m) => ({ id: m.id, label: m.label })) },
  });
  if (error) {
    let details = error.message;
    try {
      // @ts-ignore
      if (error.context?.text) details = await error.context.text();
    } catch { /* noop */ }
    return { ok: false, errorMessage: details || "Falha ao calcular a fila de WhatsApp do dia." };
  }

  const raw = Array.isArray((data as any)?.items) ? (data as any).items : [];
  const candByLead = new Map(candidates.map((c) => [c.id, c]));
  const leadsById = new Map(getLeads().map((l) => [l.id, l]));

  const items: WhatsAppQueueItem[] = raw
    .filter((x: any) => x && candByLead.has(String(x.leadId)))
    .slice(0, DAILY_LIMIT)
    .map((x: any): WhatsAppQueueItem => {
      const cand = candByLead.get(String(x.leadId))!;
      const lead = leadsById.get(String(x.leadId));
      const tier = [1, 2, 3, 4, 5].includes(x.tier) ? x.tier : 5;
      const template = findColdCallMessage(String(x.mensagemId || ""));
      const mensagem = lead && template ? renderReminderTemplate(template.text, lead) : "";
      const waLink = lead ? buildWaLink(leadWhatsappPhone(lead), mensagem) : null;
      return {
        leadId: String(x.leadId),
        empresa: cand.empresa,
        tier,
        motivo: String(x.motivo || "").slice(0, 240),
        mensagemId: template?.id || null,
        mensagem,
        waLink,
        contactedAt: null,
      };
    })
    .sort((a: WhatsAppQueueItem, b: WhatsAppQueueItem) => a.tier - b.tier);

  const result: WhatsAppQueueState = {
    date: todayKeySP(now),
    status: "locked",
    generatedAt: now.toISOString(),
    model: (data as any)?.model,
    limit: DAILY_LIMIT,
    items,
  };
  saveQueueState(result);
  return { ok: true, state: result };
}

/** Marca um item como "link clicado" (não confirma envio de fato — só reduz
 * o risco de perder a conta de quantos dos 25 já foram usados hoje). */
export function markQueueItemContacted(leadId: string) {
  const state = getQueueState();
  if (!state) return;
  const items = state.items.map((it) =>
    it.leadId === leadId && !it.contactedAt ? { ...it, contactedAt: new Date().toISOString() } : it,
  );
  saveQueueState({ ...state, items });
}

export function usedCount(state: WhatsAppQueueState | null): number {
  if (!state) return 0;
  return state.items.filter((it) => it.contactedAt).length;
}
