// Envia UM contato para o Matteline/Callface (webhook create-contact).
// Token nunca é exposto ao frontend: fica em CALLFACE_WEBHOOK_TOKEN.
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENDPOINT = "https://api.callface.io/webhooks/events/create-contact";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Telefone canônico do projeto: 55 + DDD + número.
function normalizePhoneBR(raw: string): string {
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Função reutilizável: recebe apenas name e phone. */
export async function sendContactToMatteline(
  name: string,
  phone: string,
): Promise<{ ok: boolean; status: number; response: unknown }> {
  const token = Deno.env.get("CALLFACE_WEBHOOK_TOKEN");
  if (!token) {
    return { ok: false, status: 500, response: { error: "missing_callface_token" } };
  }
  const payload = { name, phone };
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-callface-webhook-token": token,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch { /* resposta não-JSON */ }
  // Log completo da resposta do Matteline para depuração.
  console.log("[matteline-create-contact] response", {
    status: resp.status,
    headers: Object.fromEntries(resp.headers.entries()),
    body: parsed,
  });
  return { ok: resp.ok, status: resp.status, response: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  let body: { name?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phoneRaw = typeof body.phone === "string" || typeof body.phone === "number"
    ? String(body.phone)
    : "";
  const phone = normalizePhoneBR(phoneRaw);

  if (!name || name.length > 200 || !phone || phone.length < 12 || phone.length > 15) {
    return json(400, { error: "invalid_payload", message: "Informe name (1-200) e phone válido (DDD + número)." });
  }

  try {
    const result = await sendContactToMatteline(name, phone);
    return json(result.ok ? 200 : 502, {
      ok: result.ok,
      status: result.status,
      phoneSent: phone,
      matteline: result.response,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[matteline-create-contact] request_failed", message);
    return json(500, { error: "internal_error", message });
  }
});
