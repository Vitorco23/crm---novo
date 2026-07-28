// Public webhook: recebe chamadas do n8n / Matteline e enfileira uma nova
// Interaction para o Lead correspondente. NÃO executa IA — apenas persiste.
//
// Segue o mesmo padrão arquitetural de `receive-landing-lead`:
//  - Endpoint POST público (sem verify_jwt).
//  - Usa service role para gravar em uma tabela de fila (`interactions_inbound`).
//  - O CRM drena a fila e anexa a Interaction ao Lead correto no `user_storage`.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MattelinePayload {
  summarization?: string;
  transcription?: string;
  call_link?: string;
  call_duration?: number | string;
  call_audio_url?: string;
  user_email?: string;
  user_name?: string;
  destination_number?: string;
  call_status?: string;
  deal_closure_percentage?: number | string;
  scheduling?: string; // ISO da reunião agendada, se houver
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalização de telefone resiliente a qualquer formato recebido:
//  - Remove tudo que não for dígito.
//  - Se já começar com "55" (≥12 dígitos), preserva.
//  - Se começar com "0" (trunk local), preserva o 0 e prefixa "55".
//  - Se tiver apenas DDD + número (10/11 dígitos), prefixa "550".
// Todos os formatos do mesmo número geram o MESMO phoneNormalized,
// permitindo comparação estável no lado do CRM.
function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.startsWith("0")) return `55${digits}`;
  if (digits.length === 10 || digits.length === 11) return `550${digits}`;
  return digits;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, { error: "server_misconfigured" });
  }

  let raw: MattelinePayload & Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  console.log("[receive-matteline-call] payload", JSON.stringify(raw));

  const destination = (raw.destination_number || "").toString().trim();
  const phoneNormalized = normalizePhone(destination);
  // [DEBUG-TEMP] Passos 1-2: telefone recebido e normalizado.
  console.log("[receive-matteline-call][DEBUG] phone.raw=", JSON.stringify(destination));
  console.log("[receive-matteline-call][DEBUG] phone.normalized=", JSON.stringify(phoneNormalized));
  const durationSec = toNumber(raw.call_duration);
  const score = toNumber(raw.deal_closure_percentage);

  if (!phoneNormalized && !raw.summarization && !raw.transcription) {
    return json(400, {
      error: "missing_fields",
      message: "Informe pelo menos destination_number ou summarization/transcription.",
    });
  }

  const nowISO = new Date().toISOString();
  const dados = {
    // Campos normalizados (chave para o CRM anexar no Lead correto)
    phoneNormalized,
    destinationRaw: destination,
    summary: (raw.summarization || "").toString(),
    transcription: (raw.transcription || "").toString(),
    callLink: (raw.call_link || "").toString(),
    audioUrl: (raw.call_audio_url || "").toString(),
    durationSec,
    seller: {
      email: (raw.user_email || "").toString(),
      name: (raw.user_name || "").toString(),
    },
    callStatus: (raw.call_status || "").toString(),
    score, // deal_closure_percentage 0..100
    scheduling: (raw.scheduling || "").toString(),
    receivedAt: nowISO,
    source: "matteline",
    raw,
  };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: inserted, error: insErr } = await admin
    .from("interactions_inbound")
    .insert({ dados, phone_normalized: phoneNormalized || null })
    .select("id")
    .single();

  if (insErr) {
    console.error("insert interactions_inbound failed", insErr);
    return json(500, { error: "inbound_write_failed", details: insErr.message });
  }

  return json(200, {
    ok: true,
    id: inserted.id,
    queued: true,
    phoneNormalized,
  });
});
