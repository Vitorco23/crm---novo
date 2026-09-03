// ============================================================================
// HOME CHAT — Sprint 3: orquestração da nova Home conversacional ("Comando").
//
// Read-only: esta camada nunca altera lead, pipeline, tarefas, reuniões ou
// metas. Ela só lê `commercialContext` (Sprint 2B) e conversa sobre ele.
//
// Persistência: mesmo padrão já usado por `diretorIA.ts` (userStorage local +
// sync na nuvem) — não é um sistema de memória de longo prazo, é só a lista
// de mensagens da conversa atual, capada em tamanho.
//
// Saudação e sugestões são determinísticas (sem IA) e recalculadas uma vez
// por dia (fuso America/Sao_Paulo, mesmo padrão de `diretorIA.todayKey()`);
// permanecem estáveis durante a conversa daquele dia. O contexto factual
// enviado à IA, por outro lado, é recalculado a cada pergunta.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { uload, usave } from "@/shared/services/userStorage";
import { getCommercialContext, type CommercialContext } from "@/shared/services/commercialContext";
import { getLeads } from "@/shared/services/store";
import { findMentionedLead, buildLeadContextBlock } from "@/shared/services/leadLookup";

export type ChatRole = "user" | "assistant";

export interface ChatCardMetric {
  label: string;
  valor: string;
}

export interface ChatCardItem {
  nome: string;
  acao: string;
  metricas: ChatCardMetric[];
}

/**
 * Resposta estruturada do assistente (redesign pós-Sprint-3): narrativa
 * curta + até 5 cards de lead/oportunidade + pergunta de fechamento
 * contextual. Espelha `StructuredChatContent` em
 * supabase/functions/home-chat/index.ts (Deno não importa de src/, então a
 * forma é mantida em paridade manual nos dois lados).
 *
 * Mensagens salvas ANTES deste redesign não têm este campo — `structured`
 * é sempre opcional, e a UI cai para o texto em `content` (markdown antigo)
 * quando ele está ausente.
 */
export interface StructuredChatContent {
  texto_narrativo: string;
  itens: ChatCardItem[];
  pergunta_fechamento: string | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Só presente em respostas do assistente geradas após o redesign estruturado. */
  structured?: StructuredChatContent | null;
  createdAt: string;
}

export interface HomeChatProfile {
  name?: string;
  role?: string;
  company?: string;
}

const MESSAGES_KEY = "p21_home_chat_messages";
const DAILY_KEY = "p21_home_chat_daily";
const MESSAGES_LIMIT = 200;
const HISTORY_TURNS_SENT = 10;

export const HOME_CHAT_UPDATED_EVENT = "p21:home-chat-updated";

function notify() {
  try { window.dispatchEvent(new CustomEvent(HOME_CHAT_UPDATED_EVENT)); } catch { /* ignore */ }
}

/** Mesma convenção de fuso de `diretorIA.todayKey()` — dia comercial em America/Sao_Paulo. */
export function todayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

// ---------------------------------------------------------------------------
// Persistência da conversa
// ---------------------------------------------------------------------------

export function getMessages(): ChatMessage[] {
  return uload<ChatMessage[]>(MESSAGES_KEY, []);
}

function saveMessages(list: ChatMessage[]) {
  const trimmed = list.length > MESSAGES_LIMIT ? list.slice(list.length - MESSAGES_LIMIT) : list;
  usave(MESSAGES_KEY, trimmed);
  notify();
}

export function appendMessage(role: ChatRole, content: string, structured?: StructuredChatContent | null): ChatMessage {
  const msg: ChatMessage = { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
  if (structured) msg.structured = structured;
  saveMessages([...getMessages(), msg]);
  return msg;
}

/** Limpa só a conversa — nenhum dado comercial é tocado. */
export function clearConversation() {
  saveMessages([]);
}

// ---------------------------------------------------------------------------
// Saudação — determinística, mesma lógica de MissionOpening.tsx
// ---------------------------------------------------------------------------

function greetingWord(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Variações do fechamento da saudação — mesmo espírito do "Como posso ajudar
 * hoje?" que muda a cada sessão no Claude/ChatGPT. A escolha é determinística
 * por dia (ver `pickGreetingClosing`), não aleatória a cada render: assim a
 * frase fica estável durante toda a conversa do dia (mesma garantia que já
 * existia pra "Bom dia/Boa tarde/Boa noite"), só varia de um dia pro outro.
 */
export const GREETING_CLOSINGS = [
  "Por onde começamos?",
  "O que vamos resolver hoje?",
  "Bora organizar o dia?",
  "O que precisa da sua atenção agora?",
  "Qual é a prioridade agora?",
  "Como está a operação hoje?",
  "Vamos direto ao ponto?",
] as const;

function pickGreetingClosing(dateKey: string): string {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % GREETING_CLOSINGS.length;
  return GREETING_CLOSINGS[index];
}

/** `name` já deve vir resolvido pelo chamador via resolveDisplayName (nunca e-mail). */
export function computeGreeting(name: string | undefined, now: Date = new Date()): string {
  const word = greetingWord(now.getHours());
  const closing = pickGreetingClosing(todayKey(now));
  return `${word}${name ? `, ${name}` : ""}. ${closing}`;
}

// ---------------------------------------------------------------------------
// Sugestões diárias — determinísticas (sem IA), a partir do commercialContext
// ---------------------------------------------------------------------------

export const UNIVERSAL_SUGGESTIONS = [
  "O que devo priorizar hoje?",
  "Quem devo ligar agora?",
  "Como estou em relação à meta?",
  "Qual é meu maior gargalo?",
  "Analise meu pipeline.",
];

const MAX_SUGGESTIONS = 5;

export function computeDailySuggestions(ctx: CommercialContext): string[] {
  const contextual: string[] = [];
  if (ctx.followUps.overdueCount > 0) contextual.push("Quais follow-ups devo resolver primeiro?");
  if (ctx.meetings.today.length > 0) contextual.push("Como devo me preparar para minha próxima reunião?");
  if (ctx.pipeline.staleCount > 0) contextual.push("Quais oportunidades estão esfriando?");
  if (ctx.priorities.length > 0) contextual.push("Quem merece minha atenção agora?");
  if (ctx.tasks.overdueCount > 0) contextual.push("O que está atrasado hoje?");

  const out = [...contextual];
  for (const u of UNIVERSAL_SUGGESTIONS) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!out.includes(u)) out.push(u);
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

export interface DailyChatState {
  date: string;
  greeting: string;
  suggestions: string[];
}

/**
 * Sugestões são calculadas uma vez por dia e ficam estáveis durante toda a
 * conversa daquele dia — nunca recalculadas a cada mensagem (evita a fila
 * de sugestões mudando embaixo do vendedor no meio do uso).
 *
 * A saudação é diferente (ajuste 31/08): o TEXTO fica igual dentro do
 * mesmo carregamento, mas a PALAVRA (Bom dia/Boa tarde/Boa noite) é
 * recalculada a cada chamada — ou seja, atualiza a cada novo acesso à
 * tela, mesmo no mesmo dia, em vez de travar no horário do primeiro
 * acesso do dia. Isso é local ao navegador (p21_home_chat_daily nunca
 * sincroniza pra nuvem) — cada aba/origem calcula a sua.
 */
export function getOrCreateDailyState(ctx: CommercialContext, name: string | undefined, now: Date = new Date()): DailyChatState {
  const key = todayKey(now);
  const stored = uload<DailyChatState | null>(DAILY_KEY, null);
  const greeting = computeGreeting(name, now);

  if (stored && stored.date === key) {
    if (stored.greeting === greeting) return stored;
    const updated: DailyChatState = { ...stored, greeting };
    usave(DAILY_KEY, updated);
    return updated;
  }

  const fresh: DailyChatState = {
    date: key,
    greeting,
    suggestions: computeDailySuggestions(ctx),
  };
  usave(DAILY_KEY, fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Envio de mensagem — única chamada de IA desta tela, só sob interação real
// ---------------------------------------------------------------------------

export interface SendMessageResult {
  ok: boolean;
  message?: ChatMessage;
  errorMessage?: string;
}

async function extractInvokeError(error: unknown): Promise<string> {
  const err = error as { message?: string; context?: { text?: () => Promise<string> } };
  try {
    if (err?.context?.text) {
      const text = await err.context.text();
      const parsed = JSON.parse(text);
      if (parsed?.error) return String(parsed.error);
    }
  } catch { /* ignore */ }
  return err?.message || "Não foi possível obter resposta agora.";
}

/**
 * Envia uma pergunta ao chat. A mensagem do usuário é sempre persistida,
 * mesmo se a chamada de IA falhar — a resposta de erro NÃO é persistida
 * (fica só na UI, para permitir "tentar novamente" sem poluir o histórico).
 */
export async function sendMessage(text: string, profile: HomeChatProfile = {}): Promise<SendMessageResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, errorMessage: "Digite uma pergunta." };

  appendMessage("user", trimmed);

  try {
    const history = getMessages()
      .slice(-HISTORY_TURNS_SENT)
      .map((m) => ({ role: m.role, content: m.content }));

    const commercialContext = getCommercialContext({ profile });

    // Busca determinística por lead específico (auditoria 03/09 — Comando só
    // enxergava o top-15 de computePriorities(), nunca "todos os leads").
    // Se a pergunta cita um lead pelo nome/empresa, ele entra no contexto
    // mesmo sem score, autoDiagnosis ou lugar no top-15.
    const mentionedLead = findMentionedLead(trimmed, getLeads());
    const leadContext = mentionedLead ? buildLeadContextBlock(mentionedLead) : null;

    // Branch migracao-gemini: aponta pra function de teste (Gemini 2.5
    // Flash via Google AI Studio direto). Na main/produção continua
    // "home-chat" (GPT-5.4-mini via Lovable Gateway) — nunca as duas juntas.
    const { data, error } = await supabase.functions.invoke("home-chat-gemini", {
      body: { message: trimmed, history, commercialContext, userContext: profile, leadContext },
    });

    if (error) throw new Error(await extractInvokeError(error));

    const content = typeof data?.content === "string" ? data.content.trim() : "";
    if (!content) throw new Error("Não recebi uma resposta válida. Tente novamente.");

    const structured =
      data?.structured && typeof data.structured === "object"
        ? (data.structured as StructuredChatContent)
        : null;

    const assistantMsg = appendMessage("assistant", content, structured);
    return { ok: true, message: assistantMsg };
  } catch (e) {
    return { ok: false, errorMessage: (e as Error).message || "Não foi possível obter resposta agora." };
  }
}
