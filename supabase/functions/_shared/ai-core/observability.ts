// AI Core — Observabilidade de execuções de IA (Projeto Phoenix, Fase 3D.1).
//
// Objetivo: registrar METADADOS do ciclo de vida de uma execução de IA
// (início → contexto/fontes → modelo → resultado/erro → métricas) de forma
// append-only, auditável e SEM qualquer conteúdo sensível.
//
// Regras invioláveis:
//   • Nunca persistir pergunta, resposta, prompt, transcrição, notas, anexos,
//     chunks de Knowledge Base, conteúdo de memória, JWTs, API keys ou secrets.
//   • Somente IDs, versões, contagens, fontes agregadas, status e métricas.
//   • Persistência sempre com o JWT do usuário autenticado (RLS + ownership).
//     Nunca service_role.
//   • Não bloqueante: qualquer falha de telemetria é engolida e apenas logada.
//   • Métrica indisponível => null. Nunca estimar.

import { createClient } from "npm:@supabase/supabase-js@2";

export const AI_EVENTS_TABLE = "ai_execution_events";

export type AIExecutionStatus = "success" | "error" | "fallback";

/** Identificadores agregados de fontes consultadas. Nunca conteúdo. */
export type AISource = "crm" | "history" | "knowledge" | "memory" | "lead" | "snapshot";

export interface AIExecutionEvent {
  user_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  execution_id: string;
  specialist: string | null;
  task: string;
  prompt_id: string | null;
  prompt_version: string | null;
  model: string | null;
  status: AIExecutionStatus;
  latency_ms: number;
  input_chars: number | null;
  output_chars: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  sources: string[];
  tools_used: string[];
  error_code: string | null;
}

export interface StartExecutionArgs {
  task: string;
  userId: string;
  /** Header Authorization completo do usuário — usado apenas em memória. */
  authHeader?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
  specialist?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  sources?: AISource[] | string[];
  toolsUsed?: string[];
  inputChars?: number | null;
}

export interface FinishArgs {
  model?: string | null;
  outputChars?: number | null;
  inputChars?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  status?: AIExecutionStatus;
}

/** Persistidor injetável (facilita testes e mantém o módulo puro). */
export type AIEventPersister = (event: AIExecutionEvent) => Promise<void>;

const MAX_ID = 12;
const MAX_LEN = 64;

function safeStr(v: unknown, max = MAX_LEN): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
  return s.length ? s : null;
}

function safeUuid(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function safeInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

function safeNum(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/** Identificadores agregados únicos, curtos, sem conteúdo. */
function safeIdList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const s = safeStr(raw, 48);
    if (!s) continue;
    // Somente identificadores técnicos: letras, números, ponto, hífen, underscore.
    if (!/^[a-z0-9._-]+$/i.test(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= MAX_ID) break;
  }
  return out;
}

/** Normaliza qualquer erro em um código técnico curto e seguro. */
export function normalizeErrorCode(err: unknown): string {
  const anyErr = err as { status?: number; code?: string; name?: string; message?: string } | null;
  const status = typeof anyErr?.status === "number" ? anyErr.status : null;
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "credits_exhausted";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status && status >= 500) return "upstream_error";
  if (status && status >= 400) return "bad_request";
  const name = safeStr(anyErr?.name, 40);
  if (name === "UnsafeAIOutputError") return "unsafe_output";
  const msg = typeof anyErr?.message === "string" ? anyErr.message.toLowerCase() : "";
  if (!msg) return "unknown_error";
  if (msg.includes("timeout") || msg.includes("aborted")) return "timeout";
  if (msg.includes("embedding")) return "embedding_failed";
  if (msg.includes("json") || msg.includes("parse")) return "invalid_format";
  if (msg.includes("missing") || msg.includes("env")) return "misconfigured";
  if (msg.includes("network") || msg.includes("fetch")) return "network_error";
  return "unknown_error";
}

/** Monta o evento final já sanitizado (nunca contém conteúdo). */
export function buildEvent(
  start: StartExecutionArgs,
  finish: FinishArgs & { status: AIExecutionStatus; errorCode?: string | null },
  latencyMs: number,
  executionId: string,
): AIExecutionEvent {
  return {
    user_id: start.userId,
    conversation_id: safeUuid(start.conversationId),
    lead_id: safeStr(start.leadId, 64),
    execution_id: executionId,
    specialist: safeStr(start.specialist, 48),
    task: safeStr(start.task, 48) ?? "unknown",
    prompt_id: safeStr(start.promptId, 64),
    prompt_version: safeStr(start.promptVersion, 24),
    model: safeStr(finish.model, 96),
    status: finish.status,
    latency_ms: safeInt(latencyMs) ?? 0,
    input_chars: safeInt(finish.inputChars ?? start.inputChars),
    output_chars: safeInt(finish.outputChars),
    input_tokens: safeInt(finish.inputTokens),
    output_tokens: safeInt(finish.outputTokens),
    estimated_cost: safeNum(finish.estimatedCost),
    sources: safeIdList(start.sources),
    tools_used: safeIdList(start.toolsUsed),
    error_code: safeStr(finish.errorCode, 48),
  };
}

/** Persistidor padrão: usa SEMPRE o JWT do usuário (RLS aplicada). */
export function createUserScopedPersister(authHeader?: string | null): AIEventPersister {
  return async (event: AIExecutionEvent) => {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon || !authHeader) throw new Error("telemetry_no_user_context");
    const sb = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.from(AI_EVENTS_TABLE).insert(event);
    if (error) throw new Error(error.message);
  };
}

export interface AIExecutionRecorder {
  executionId: string;
  addSource(source: AISource | string): void;
  addTool(tool: string): void;
  setPrompt(promptId: string | null, promptVersion?: string | null): void;
  setSpecialist(specialist: string | null): void;
  setLead(leadId: string | null): void;
  /** Registra sucesso (ou fallback). Nunca lança. */
  success(args?: FinishArgs): Promise<void>;
  /** Registra falha com código normalizado. Nunca lança. */
  failure(err: unknown, args?: FinishArgs): Promise<void>;
}

/**
 * Inicia o registro de uma execução de IA.
 * Uso: const rec = startAIExecution({...}); ... await rec.success({ model, outputChars })
 */
export function startAIExecution(
  args: StartExecutionArgs,
  persister?: AIEventPersister,
): AIExecutionRecorder {
  const startedAt = Date.now();
  const executionId = crypto.randomUUID();
  const state: StartExecutionArgs = {
    ...args,
    sources: safeIdList(args.sources),
    toolsUsed: safeIdList(args.toolsUsed),
  };
  const persist = persister ?? createUserScopedPersister(args.authHeader);

  const write = async (
    finish: FinishArgs & { status: AIExecutionStatus; errorCode?: string | null },
  ) => {
    try {
      if (!state.userId) throw new Error("telemetry_no_user_context");
      const event = buildEvent(state, finish, Date.now() - startedAt, executionId);
      await persist(event);
    } catch (e) {
      // Telemetria NUNCA quebra a resposta principal — apenas log técnico seguro.
      console.warn(JSON.stringify({
        evt: "ai_telemetry_failed",
        execution_id: executionId,
        task: safeStr(state.task, 48),
        reason: normalizeErrorCode(e),
      }));
    }
  };

  return {
    executionId,
    addSource(source) {
      state.sources = safeIdList([...(state.sources ?? []), source]);
    },
    addTool(tool) {
      state.toolsUsed = safeIdList([...(state.toolsUsed ?? []), tool]);
    },
    setPrompt(promptId, promptVersion) {
      state.promptId = promptId;
      if (promptVersion !== undefined) state.promptVersion = promptVersion;
    },
    setSpecialist(specialist) {
      state.specialist = specialist;
    },
    setLead(leadId) {
      state.leadId = leadId;
    },
    success(finishArgs = {}) {
      return write({ ...finishArgs, status: finishArgs.status ?? "success", errorCode: null });
    },
    failure(err, finishArgs = {}) {
      return write({
        ...finishArgs,
        status: finishArgs.status ?? "error",
        errorCode: normalizeErrorCode(err),
      });
    },
  };
}
