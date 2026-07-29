// knowledge-import — extrai texto de .md / .txt / .pdf / .docx (base64).
// Devolve { text, suggestedTitle } para pré-visualização/edição no admin.

import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function deriveTitle(filename: string, text: string): string {
  const base = (filename || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (base) return base.slice(0, 120);
  const firstLine = text.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.replace(/^#+\s*/, "").slice(0, 120) || "Documento importado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const { filename = "", fileBase64 = "" } = (await req.json().catch(() => ({}))) as {
      filename?: string; fileBase64?: string;
    };
    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "file_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = base64ToBytes(fileBase64);
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "file_too_large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (filename.split(".").pop() || "").toLowerCase();
    let text = "";

    if (ext === "md" || ext === "txt" || ext === "markdown") {
      text = new TextDecoder("utf-8").decode(bytes);
    } else if (ext === "docx") {
      const mammoth = await import("npm:mammoth@1.8.0");
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value ?? "";
    } else if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("npm:unpdf@0.11.0");
      const pdf = await getDocumentProxy(bytes);
      const { text: pdfText } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(pdfText) ? pdfText.join("\n\n") : String(pdfText ?? "");
    } else {
      return new Response(JSON.stringify({ error: "unsupported_extension", extension: ext }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    text = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
    const suggestedTitle = deriveTitle(filename, text);

    return new Response(JSON.stringify({
      text,
      suggestedTitle,
      chars: text.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(JSON.stringify({ evt: "kb_import_error", msg: (e as Error).message }));
    return new Response(JSON.stringify({ error: "internal_error", detail: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
