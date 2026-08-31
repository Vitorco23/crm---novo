// Chamada DIRETA ao Google AI Studio (Generative Language API) — branch de
// migração (migracao-gemini). Não passa pelo AI Router / Lovable Gateway de
// propósito: é o ponto de partida pra sair de vez do Lovable como
// intermediário de IA. Usa GOOGLE_AI_STUDIO_API_KEY (secret do Supabase,
// separado de LOVABLE_API_KEY — nunca reaproveitar o mesmo nome de secret,
// pra não colidir com o que a function original ainda usa).
//
// Formato de saída estruturada: Gemini usa um subconjunto de OpenAPI 3.0
// (tipos em maiúsculo: STRING/OBJECT/ARRAY/NUMBER/BOOLEAN; nullable via
// campo "nullable", não union de tipo) — diferente do JSON Schema estrito
// da OpenAI. Quem chama este módulo passa o schema já no formato do Gemini.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiSchema {
  type: "STRING" | "OBJECT" | "ARRAY" | "NUMBER" | "BOOLEAN" | "INTEGER";
  description?: string;
  nullable?: boolean;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
}

export interface GeminiCallOptions {
  model?: string; // default gemini-2.5-flash
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: GeminiSchema;
  /** JSON mode sem schema estrito — mesmo espírito do `callAI({ json: true })`
   * do AI Router. Ignorado se responseSchema já foi passado. */
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeminiCallResult {
  content: string;
  modelUsed: string;
  latencyMs: number;
}

export class GeminiCallError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function callGeminiDirect(opts: GeminiCallOptions): Promise<GeminiCallResult> {
  const apiKey = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_API_KEY não configurada");

  const model = opts.model || "gemini-2.5-flash";
  const timeoutMs = opts.timeoutMs ?? 45000;
  const started = Date.now();

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
    // Gemini 2.5 Flash "pensa" por padrão, e esses tokens de raciocínio
    // saem do MESMO orçamento de maxOutputTokens, antes do texto visível —
    // em prompts grandes isso consumia o orçamento inteiro e cortava o
    // JSON no início, mesmo com maxOutputTokens alto (visto em teste real:
    // truncava quase no mesmo ponto em 2000 e em 4000 tokens). Não há
    // necessidade de raciocínio visível aqui, só a resposta estruturada.
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.responseSchema;
  } else if (opts.jsonMode) {
    generationConfig.responseMimeType = "application/json";
  }

  const body = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
    generationConfig,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey, // header em vez de query param — não vaza em log de URL
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GeminiCallError(text.slice(0, 500) || `gemini_http_${res.status}`, res.status);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
      throw new GeminiCallError(`Resposta bloqueada pelo Gemini (${finishReason})`, 502);
    }

    const content: string = candidate?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
    return { content, modelUsed: model, latencyMs: Date.now() - started };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof GeminiCallError) throw e;
    const isAbort = (e as Error)?.name === "AbortError";
    throw new GeminiCallError(isAbort ? "Tempo limite ao chamar o Gemini" : (e as Error)?.message || "gemini_call_failed", isAbort ? 504 : 502);
  }
}
