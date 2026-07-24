// AI Router — orquestrador central de IA do CRM Performance21.
// Toda chamada de IA de qualquer edge function DEVE passar por callAI().
// Features não devem conhecer nem citar modelos específicos.
//
// Provedor único: Lovable AI Gateway (LOVABLE_API_KEY cobre OpenAI + Google).
// Fallback automático em 429/402/5xx/timeout/network.
// Log best-effort em public.ai_router_logs (não bloqueia).

import { createClient } from "npm:@supabase/supabase-js@2";

export type AITask = "diretor_comercial" | "auditor_ligacao" | "audit_transcript" | "analyze_attachment" | "extract_memory" | "priority_leads";

export interface AIRouterOptions {
  task: AITask;
  system: string;
  user: string;
  /** Conteúdo multimodal (blocos type/text/image_url/file). Se presente, substitui `user`. */
  userContent?: unknown[];
  /** Total de caracteres do input relevante (usado para escolher tier de modelo). */
  inputChars?: number;
  /** Força tier complexo mesmo com input pequeno. */
  forceComplex?: boolean;
  /** Pede JSON puro (response_format json_object). */
  json?: boolean;
  /** JSON Schema estrito (OpenAI structured outputs). */
  schema?: { name: string; schema: Record<string, unknown> };
  /** Temperatura (default 0.3). */
  temperature?: number;
  /** Máximo de tokens de saída (default 4096). */
  maxTokens?: number;
  /** Timeout por tentativa em ms (default 45s). */
  timeoutMs?: number;
}

export interface AIRouterResult {
  content: string;
  modelUsed: string;
  attempts: number;
  latencyMs: number;
}

interface ModelSpec {
  id: string;
  /** Aceita JSON schema estrito (OpenAI). */
  supportsJsonSchema: boolean;
}

// Registry por tarefa. Ordem = prioridade (mais barato/adequado primeiro).
// Alterar aqui é suficiente para trocar modelos — nenhuma feature precisa mudar.
const REGISTRY: Record<AITask, { tiers: ModelSpec[][]; fallback: ModelSpec[] }> = {
  // Diretor Comercial: importância estratégica, nunca Gemini.
  diretor_comercial: {
    tiers: [
      [{ id: "openai/gpt-5.4-mini", supportsJsonSchema: true }],
      [{ id: "openai/gpt-5.4-mini", supportsJsonSchema: true }],
      [{ id: "openai/gpt-5.4-mini", supportsJsonSchema: true }],
    ],
    fallback: [
      { id: "openai/gpt-5.4-nano", supportsJsonSchema: true },
    ],
  },
  // Auditor Comercial (análise de ligações): tiers por tamanho do input.
  auditor_ligacao: {
    tiers: [
      // Simples: pouco texto, interpretação objetiva
      [{ id: "google/gemini-3.1-flash-lite", supportsJsonSchema: false }],
      // Médio: interpretação comercial mais elaborada
      [{ id: "google/gemini-2.5-flash", supportsJsonSchema: false }],
      // Complexo: histórico longo, múltiplas objeções, raciocínio profundo
      [{ id: "google/gemini-3.6-flash", supportsJsonSchema: false }],
    ],
    fallback: [
      { id: "google/gemini-2.5-flash", supportsJsonSchema: false },
      { id: "openai/gpt-5.4-mini", supportsJsonSchema: true },
    ],
  },
  // Audit transcript (BANT rápido de reunião): mesmo pool do auditor.
  audit_transcript: {
    tiers: [
      [{ id: "google/gemini-3.1-flash-lite", supportsJsonSchema: false }],
      [{ id: "google/gemini-2.5-flash", supportsJsonSchema: false }],
      [{ id: "google/gemini-3.6-flash", supportsJsonSchema: false }],
    ],
    fallback: [
      { id: "openai/gpt-5.4-mini", supportsJsonSchema: true },
    ],
  },
  // Leitura de anexos (imagens, prints, PDFs, documentos). Multimodal obrigatório.
  analyze_attachment: {
    tiers: [
      [{ id: "google/gemini-2.5-flash", supportsJsonSchema: false }],
      [{ id: "google/gemini-2.5-flash", supportsJsonSchema: false }],
      [{ id: "openai/gpt-5.5", supportsJsonSchema: true }],
    ],
    fallback: [
      { id: "openai/gpt-5.5", supportsJsonSchema: true },
    ],
  },
  // Extração de memória comercial (padrões, objeções, insights). Barato + estruturado.
  extract_memory: {
    tiers: [
      [{ id: "google/gemini-3.1-flash-lite", supportsJsonSchema: false }],
      [{ id: "google/gemini-3.6-flash", supportsJsonSchema: false }],
      [{ id: "google/gemini-3.6-flash", supportsJsonSchema: false }],
    ],
    fallback: [
      { id: "openai/gpt-5.4-nano", supportsJsonSchema: true },
    ],
  },
};

function pickTierIndex(inputChars: number, forceComplex?: boolean): 0 | 1 | 2 {
  if (forceComplex) return 2;
  if (inputChars < 800) return 0;
  if (inputChars < 3000) return 1;
  return 2;
}

function buildModelChain(task: AITask, inputChars: number, forceComplex?: boolean): ModelSpec[] {
  const cfg = REGISTRY[task];
  const idx = pickTierIndex(inputChars, forceComplex);
  const chain: ModelSpec[] = [];
  // Modelo escolhido pelo tier
  chain.push(...cfg.tiers[idx]);
  // Depois, sobe para tiers superiores (mais capacidade) que ainda não foram tentados
  for (let i = idx + 1; i < cfg.tiers.length; i++) {
    for (const m of cfg.tiers[i]) if (!chain.find((c) => c.id === m.id)) chain.push(m);
  }
  // Por fim, fallback (outro provedor)
  for (const m of cfg.fallback) if (!chain.find((c) => c.id === m.id)) chain.push(m);
  return chain;
}

async function logAttempt(entry: {
  task: string;
  model: string;
  attempt_index: number;
  input_chars: number;
  latency_ms: number;
  success: boolean;
  error_type?: string | null;
  fallback_reason?: string | null;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await admin.from("ai_router_logs").insert(entry);
  } catch {
    // best-effort: nunca quebra a request principal
  }
}

function classifyError(status: number | null, err?: unknown): { retryable: boolean; type: string } {
  if (status === null) return { retryable: true, type: "network_or_timeout" };
  if (status === 429) return { retryable: true, type: "rate_limit" };
  if (status === 408) return { retryable: true, type: "timeout" };
  if (status >= 500) return { retryable: true, type: `http_${status}` };
  // 402 (créditos esgotados) — tenta o próximo modelo caso seja de outro provedor/pool
  if (status === 402) return { retryable: true, type: "payment_required" };
  return { retryable: false, type: `http_${status}` };
}

export async function callAI(opts: AIRouterOptions): Promise<AIRouterResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const inputChars = opts.inputChars ?? (opts.system.length + opts.user.length);
  const chain = buildModelChain(opts.task, inputChars, opts.forceComplex);
  const timeoutMs = opts.timeoutMs ?? 45000;
  const startedAll = Date.now();

  let lastError: { status: number | null; type: string; message: string } | null = null;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: model.id,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userContent ?? opts.user },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4096,
      };
      if (opts.schema && model.supportsJsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: opts.schema.name, schema: opts.schema.schema, strict: true },
        };
      } else if (opts.json || opts.schema) {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const cls = classifyError(res.status);
        lastError = { status: res.status, type: cls.type, message: text.slice(0, 400) };
        await logAttempt({
          task: opts.task,
          model: model.id,
          attempt_index: i,
          input_chars: inputChars,
          latency_ms: Date.now() - started,
          success: false,
          error_type: cls.type,
          fallback_reason: cls.retryable ? "will_try_next" : "terminal",
        });
        if (!cls.retryable) break;
        continue;
      }

      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content ?? "";
      await logAttempt({
        task: opts.task,
        model: model.id,
        attempt_index: i,
        input_chars: inputChars,
        latency_ms: Date.now() - started,
        success: true,
      });
      return {
        content,
        modelUsed: model.id,
        attempts: i + 1,
        latencyMs: Date.now() - startedAll,
      };
    } catch (e) {
      clearTimeout(timer);
      const isAbort = (e as Error)?.name === "AbortError";
      const cls = classifyError(null, e);
      lastError = {
        status: null,
        type: isAbort ? "timeout" : cls.type,
        message: (e as Error)?.message || String(e),
      };
      await logAttempt({
        task: opts.task,
        model: model.id,
        attempt_index: i,
        input_chars: inputChars,
        latency_ms: Date.now() - started,
        success: false,
        error_type: lastError.type,
        fallback_reason: "network_or_timeout",
      });
      continue;
    }
  }

  const err = new Error(
    `AI Router: todos os modelos falharam para task "${opts.task}". Último erro: ${lastError?.type ?? "desconhecido"} — ${lastError?.message ?? ""}`,
  ) as Error & { status?: number; type?: string };
  err.status = lastError?.status ?? 502;
  err.type = lastError?.type;
  throw err;
}
