// knowledge-import — extrai texto de .md / .txt / .pdf / .docx (base64).
// Devolve { text, suggestedTitle } para pré-visualização/edição no admin.
//
// Fase 3C+: governança de ingestão aplicada via AI Core
// (limites de bytes/caracteres, validação de extensão, normalização,
// marcação de conteúdo suspeito e logs padronizados).

import { requireUser } from "../_shared/require-auth.ts";
import {
  KNOWLEDGE_EXTENSIONS,
  KNOWLEDGE_INGESTION_LIMITS,
  logKnowledgeIngest,
  normalizeExtension,
  normalizeIngestText,
  normalizeTitle,
  scanIngestContent,
} from "../_shared/ai-core/knowledge-ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function deriveTitle(filename: string, text: string): string {
  const base = (filename || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (base) return normalizeTitle(base);
  const firstLine = text.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return normalizeTitle(firstLine.replace(/^#+\s*/, "")) || "Documento importado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  try {
    const { filename = "", fileBase64 = "" } = (await req.json().catch(() => ({}))) as {
      filename?: string; fileBase64?: string;
    };
    if (!fileBase64 || typeof fileBase64 !== "string") {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "rejected", reason: "file_required" });
      return json({ error: "file_required" }, 400);
    }

    // Validação de extensão ANTES de decodificar (economia + superfície menor).
    const ext = normalizeExtension(filename);
    if (!ext) {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "rejected", reason: "unsupported_extension" });
      return json({ error: "unsupported_extension", supported: KNOWLEDGE_EXTENSIONS }, 400);
    }

    // Teto de bytes estimado pelo próprio base64, antes de alocar memória.
    const approxBytes = Math.floor((fileBase64.length * 3) / 4);
    if (approxBytes > KNOWLEDGE_INGESTION_LIMITS.maxFileBytes) {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "rejected", reason: "file_too_large", bytes: approxBytes, extension: ext });
      return json({ error: "file_too_large", maxBytes: KNOWLEDGE_INGESTION_LIMITS.maxFileBytes }, 413);
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(fileBase64);
    } catch {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "rejected", reason: "invalid_base64", extension: ext });
      return json({ error: "invalid_base64" }, 400);
    }
    if (bytes.byteLength > KNOWLEDGE_INGESTION_LIMITS.maxFileBytes) {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "rejected", reason: "file_too_large", bytes: bytes.byteLength, extension: ext });
      return json({ error: "file_too_large", maxBytes: KNOWLEDGE_INGESTION_LIMITS.maxFileBytes }, 413);
    }

    let raw = "";
    if (ext === "md" || ext === "txt" || ext === "markdown") {
      raw = new TextDecoder("utf-8").decode(bytes);
    } else if (ext === "docx") {
      const mammoth = await import("npm:mammoth@1.8.0");
      const result = await mammoth.extractRawText({ buffer: bytes });
      raw = result.value ?? "";
    } else {
      const { extractText, getDocumentProxy } = await import("npm:unpdf@0.11.0");
      const pdf = await getDocumentProxy(bytes);
      const { text: pdfText } = await extractText(pdf, { mergePages: true });
      raw = Array.isArray(pdfText) ? pdfText.join("\n\n") : String(pdfText ?? "");
    }

    // Normalização/sanitização estrutural + teto de caracteres.
    const normalized = normalizeIngestText(raw, KNOWLEDGE_INGESTION_LIMITS.maxExtractedChars);
    if (!normalized.text) {
      logKnowledgeIngest({ evt: "knowledge_import", stage: "empty", extension: ext, bytes: bytes.byteLength, ms: Date.now() - startedAt });
      return json({ error: "empty_document" }, 422);
    }

    const flags = scanIngestContent(normalized.text);
    const suggestedTitle = deriveTitle(filename, normalized.text);

    logKnowledgeIngest({
      evt: "knowledge_import",
      stage: "ok",
      extension: ext,
      bytes: bytes.byteLength,
      chars: normalized.chars,
      originalChars: normalized.originalChars,
      truncated: normalized.truncated,
      suspicious: flags.suspicious,
      patterns: flags.patterns,
      ms: Date.now() - startedAt,
    });

    return json({
      text: normalized.text,
      suggestedTitle,
      chars: normalized.chars,
      truncated: normalized.truncated,
    });
  } catch (e) {
    logKnowledgeIngest({ evt: "knowledge_import", stage: "error", reason: (e as Error).message.slice(0, 200), ms: Date.now() - startedAt });
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
