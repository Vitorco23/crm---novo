// Public webhook: recebe atualizações do agente externo de disparo/
// prospecção via WhatsApp e enfileira uma nova Interaction para o lead
// correspondente. Mesma arquitetura de receive-matteline-call: NÃO grava
// direto no lead (que vive como blob sincronizado em user_storage, não
// como tabela normalizada) — só enfileira em interactions_inbound; o
// merge de verdade acontece client-side (syncInboundInteractions em
// userStorage.ts) na próxima vez que o app estiver aberto.
//
// Por design, este endpoint NUNCA move o lead de etapa (stage) — só
// registra uma Interaction (com o status/próxima ação do payload dentro
// das notas). Igual ao Matteline, que também nunca altera pipeline
// diretamente. Isso preserva o motor de priorização como única fonte de
// verdade sobre em que etapa um lead está.
//
// Autenticação: segredo compartilhado via header, mesmo padrão de
// MATTELINE_WEBHOOK_SECRET (ver receive-matteline-call). Configurar
// WHATSAPP_AGENT_WEBHOOK_SECRET nas secrets do projeto antes de usar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { constantTimeEqual, readWebhookJson } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-secret, x-api-key, secret",
};

interface AgentPayload {
  phone?: string;
  status?: string;
  message?: string;
  nextAction?: string;
  dispatchId?: string;
  receivedAt?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SECRET_HEADERS = ["x-webhook-secret", "x-secret", "x-api-key", "secret", "apikey"];

function extractProvidedSecret(req: Request): string | null {
  for (const name of SECRET_HEADERS) {
    const v = req.headers.get(name);
    if (v && v.trim()) return v.trim();
  }
  const auth = req.headers.get("authorization");
  if (auth && auth.trim()) {
    const t = auth.trim();
    if (t.toLowerCase().startsWith("bearer ")) return t.slice(7).trim();
    return t;
  }
  return null;
}

// Mesma regra de normalização de telefone já usada em receive-matteline-call
// — preservada verbatim para os dois webhooks resolverem o mesmo lead do
// mesmo jeito.
function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.startsWith("0")) return `55${digits}`;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_AGENT_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE || !WEBHOOK_SECRET) {
    console.error("[whatsapp-agent-update-lead] server_misconfigured (missing env)");
    return json(500, { error: "server_misconfigured" });
  }

  const provided = extractProvidedSecret(req);
  if (!provided || !constantTimeEqual(provided, WEBHOOK_SECRET)) {
    console.warn("[whatsapp-agent-update-lead] unauthorized request", { hasCredential: Boolean(provided) });
    return json(401, { error: "unauthorized" });
  }

  const parsed = await readWebhookJson(req);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const raw = parsed.value as AgentPayload;

  const phoneNormalized = normalizePhone(raw.phone);
  if (!phoneNormalized) {
    return json(400, { error: "missing_fields", message: "Informe 'phone' com um telefone válido." });
  }
  const message = typeof raw.message === "string" ? raw.message.trim().slice(0, 4000) : "";
  const status = typeof raw.status === "string" ? raw.status.trim().slice(0, 200) : "";
  const nextAction = typeof raw.nextAction === "string" ? raw.nextAction.trim().slice(0, 500) : "";
  if (!message && !status && !nextAction) {
    return json(400, {
      error: "missing_fields",
      message: "Informe pelo menos 'message', 'status' ou 'nextAction'.",
    });
  }

  const dispatchId = typeof raw.dispatchId === "string" ? raw.dispatchId.trim() : "";
  const nowISO = new Date().toISOString();
  const dados = {
    source: "whatsapp_agent",
    phoneNormalized,
    message,
    status,
    nextAction,
    receivedAt: nowISO,
    dispatchId: dispatchId || undefined,
  };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Idempotência: reaproveita a mesma coluna/índice único de call_id que já
  // existe para o Matteline — aqui, o dispatchId do agente externo.
  const { data: inserted, error: insErr } = await admin
    .from("interactions_inbound")
    .insert({ dados, phone_normalized: phoneNormalized, call_id: dispatchId || null })
    .select("id")
    .single();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      console.log("[whatsapp-agent-update-lead] duplicate dispatchId, skipped", { dispatchId, phoneNormalized });
      return json(200, { ok: true, duplicate: true, dispatchId });
    }
    console.error("[whatsapp-agent-update-lead] insert_failed", { code, message: insErr.message });
    return json(500, { error: "inbound_write_failed" });
  }

  console.log("[whatsapp-agent-update-lead] queued", { id: inserted.id, phoneNormalized });

  return json(200, {
    ok: true,
    id: inserted.id,
    queued: true,
    phoneNormalized,
    note: "Registrado na fila. Será mesclado ao histórico do lead na próxima sincronização do CRM (o app precisa estar aberto ou ser aberto em breve).",
  });
});
