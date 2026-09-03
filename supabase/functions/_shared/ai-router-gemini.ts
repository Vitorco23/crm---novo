// AI Router (Gemini-only) — substituto de ai-router.ts para operar sem
// nenhuma dependência do Lovable AI Gateway (LOVABLE_API_KEY). Mesma
// interface pública (AITask/AIRouterOptions/AIRouterResult/callAI) do
// ai-router.ts original: quem já chamava callAI() só troca o import,
// nenhuma outra mudança é necessária.
//
// Diferenças deliberadas do original:
//   - Único provedor: Google AI Studio (Generative Language API) direto,
//     sem Lovable no meio. Usa GOOGLE_AI_STUDIO_API_KEY.
//   - Nenhuma tarefa usa OpenAI/JSON Schema estrito — nenhuma das 9
//     functions que ainda dependiam do AI Router usava `schema` (structured
//     outputs), só `json: true` (modo solto), o que o Gemini já cobre via
//     responseMimeType. Se uma tarefa nova precisar de schema estrito no
//     futuro, adicionar conversão JSON Schema -> Gemini Schema aqui.
//   - Multimodal (`userContent` com image_url/file) convertido pro formato
//     inlineData do Gemini (base64 + mimeType extraídos da data URL).
//   - Mesmo log best-effort em public.ai_router_logs.

import { createClient } from "npm:@supabase/supabase-js@2";

export type AITask = "diretor_comercial" | "auditor_ligacao" | "audit_transcript" | "analyze_attachment" | "extract_memory" | "priority_leads" | "auto_diagnosis" | "intel_router" | "consultor_leads" | "mentor_p21";

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
  /** JSON Schema estrito — não suportado neste router (ver nota acima). Ignorado com aviso no log. */
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

// Registry por tarefa — só modelos Gemini, do mais barato/rápido pro mais
// capaz. Ordem dentro de cada tier = prioridade.
const REGISTRY: Record<AITask, string[][]> = {
  diretor_comercial: [["gemini-2.5-flash"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  auditor_ligacao: [["gemini-3.1-flash-lite"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  audit_transcript: [["gemini-3.1-flash-lite"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  analyze_attachment: [["gemini-2.5-flash"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  extract_memory: [["gemini-3.1-flash-lite"], ["gemini-3.6-flash"], ["gemini-3.6-flash"]],
  priority_leads: [["gemini-2.5-flash"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  auto_diagnosis: [["gemini-3.1-flash-lite"], ["gemini-3.1-flash-lite"], ["gemini-2.5-flash"]],
  intel_router: [["gemini-3.1-flash-lite"], ["gemini-3.1-flash-lite"], ["gemini-2.5-flash"]],
  consultor_leads: [["gemini-2.5-flash"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
  mentor_p21: [["gemini-2.5-flash"], ["gemini-2.5-flash"], ["gemini-3.6-flash"]],
};

// Fallback universal se toda a cadeia da tarefa falhar (ex: modelo tier
// mais alto indisponível na região/conta).
const UNIVERSAL_FALLBACK = "gemini-2.5-flash";

function pickTierIndex(inputChars: number, forceComplex?: boolean): 0 | 1 | 2 {
  if (forceComplex) return 2;
  if (inputChars < 800) return 0;
  if (inputChars < 3000) return 1;
  return 2;
}

function buildModelChain(task: AITask, inputChars: number, forceComplex?: boolean): string[] {
  const tiers = REGISTRY[task];
  const idx = pickTierIndex(inputChars, forceComplex);
  const chain: string[] = [];
  for (const m of tiers[idx]) chain.push(m);
  for (let i = idx + 1; i < tiers.length; i++) {
    for (const m of tiers[i]) if (!chain.includes(m)) chain.push(m);
  }
  if (!chain.includes(UNIVERSAL_FALLBACK)) chain.push(UNIVERSAL_FALLBACK);
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

function classifyError(status: number | null): { retryable: boolean; type: string } {
  if (status === null) return { retryable: true, type: "network_or_timeout" };
  if (status === 429) return { retryable: true, type: "rate_limit" };
  if (status >= 500) return { retryable: true, type: `http_${status}` };
  return { retryable: false, type: `http_${status}` };
}

/** `data:<mime>;base64,<data>` -> { mimeType, data } para o formato inlineData do Gemini. */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

/** Converte os blocos no formato OpenAI (type: text/image_url/file) usados
 * por analyze-attachment para `parts` no formato do Gemini. */
function convertUserContentToParts(blocks: unknown[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const raw of blocks) {
    const b = raw as Record<string, unknown>;
    if (b.type === "text") {
      parts.push({ text: String(b.text ?? "") });
    } else if (b.type === "image_url") {
      const url = (b.image_url as { url?: string } | undefined)?.url;
      const parsed = url ? parseDataUrl(url) : null;
      if (parsed) parts.push({ inlineData: parsed });
    } else if (b.type === "file") {
      const file = b.file as { file_data?: string } | undefined;
      const parsed = file?.file_data ? parseDataUrl(file.file_data) : null;
      if (parsed) parts.push({ inlineData: parsed });
    }
  }
  return parts;
}

export async function callAI(opts: AIRouterOptions): Promise<AIRouterResult> {
  const apiKey = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_API_KEY não configurada");

  const inputChars = opts.inputChars ?? (opts.system.length + opts.user.length);
  const chain = buildModelChain(opts.task, inputChars, opts.forceComplex);
  const timeoutMs = opts.timeoutMs ?? 45000;
  const startedAll = Date.now();

  const parts = opts.userContent
    ? convertUserContentToParts(opts.userContent)
    : [{ text: opts.user }];

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 4096,
    // Ver gemini-direct.ts: thinking consome o mesmo orçamento de tokens de
    // saída e trunca respostas estruturadas se não desativado.
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts.json || opts.schema) {
    generationConfig.responseMimeType = "application/json";
  }

  let lastError: { status: number | null; type: string; message: string } | null = null;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: "user", parts }],
            generationConfig,
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const cls = classifyError(res.status);
        lastError = { status: res.status, type: cls.type, message: text.slice(0, 400) };
        await logAttempt({
          task: opts.task, model, attempt_index: i, input_chars: inputChars,
          latency_ms: Date.now() - started, success: false,
          error_type: cls.type, fallback_reason: cls.retryable ? "will_try_next" : "terminal",
        });
        if (!cls.retryable) break;
        continue;
      }

      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
        lastError = { status: 502, type: "blocked", message: `finishReason=${finishReason}` };
        await logAttempt({
          task: opts.task, model, attempt_index: i, input_chars: inputChars,
          latency_ms: Date.now() - started, success: false,
          error_type: "blocked", fallback_reason: "will_try_next",
        });
        continue;
      }

      const content: string = candidate?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
      await logAttempt({
        task: opts.task, model, attempt_index: i, input_chars: inputChars,
        latency_ms: Date.now() - started, success: true,
      });
      return { content, modelUsed: model, attempts: i + 1, latencyMs: Date.now() - startedAll };
    } catch (e) {
      clearTimeout(timer);
      const isAbort = (e as Error)?.name === "AbortError";
      lastError = {
        status: null,
        type: isAbort ? "timeout" : "network_or_timeout",
        message: (e as Error)?.message || String(e),
      };
      await logAttempt({
        task: opts.task, model, attempt_index: i, input_chars: inputChars,
        latency_ms: Date.now() - started, success: false,
        error_type: lastError.type, fallback_reason: "network_or_timeout",
      });
      continue;
    }
  }

  const err = new Error(
    `AI Router (Gemini): todos os modelos falharam para task "${opts.task}". Último erro: ${lastError?.type ?? "desconhecido"} — ${lastError?.message ?? ""}`,
  ) as Error & { status?: number; type?: string };
  err.status = lastError?.status ?? 502;
  err.type = lastError?.type;
  throw err;
}
