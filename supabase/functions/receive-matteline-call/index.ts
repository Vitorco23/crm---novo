// Public webhook: recebe chamadas do n8n / Matteline e enfileira uma nova
// Interaction para o Lead correspondente. NÃO executa IA — apenas persiste.
//
// V1.1 infra hardening:
//   1. Shared-secret authentication via `MATTELINE_WEBHOOK_SECRET`.
//   2. Idempotent enqueue via `call_id` (unique partial index).
//   3. Production-only logs (no payload/transcript dumps).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-matteline-signature",
};

interface MattelinePayload {
  call_id?: string;
  id?: string;
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
  scheduling?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time comparison to avoid timing side-channels on the shared secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function extractProvidedSecret(req: Request): string | null {
  const sig = req.headers.get("x-matteline-signature");
  if (sig && sig.trim()) return sig.trim();
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

// Same normalization as before — preserved verbatim to avoid regressions.
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

// Deterministic idempotency key. Prefer whatever the provider gives us;
// otherwise derive a stable fingerprint so retries collapse into one row.
async function computeCallId(raw: MattelinePayload, phoneNormalized: string): Promise<string> {
  const explicit = (raw.call_id || raw.id || "").toString().trim();
  if (explicit) return explicit;
  if (raw.call_link) return `link:${raw.call_link}`;
  if (raw.call_audio_url) return `audio:${raw.call_audio_url}`;
  const seed = [
    phoneNormalized,
    String(raw.call_duration ?? ""),
    (raw.call_status ?? "").toString(),
    (raw.summarization ?? "").toString().slice(0, 240),
  ].join("|");
  const buf = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `fp:${hex}`;
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
  const WEBHOOK_SECRET = Deno.env.get("MATTELINE_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE || !WEBHOOK_SECRET) {
    console.error("[receive-matteline-call] server_misconfigured (missing env)");
    return json(500, { error: "server_misconfigured" });
  }

  // 1) Shared-secret auth. Reject BEFORE parsing the body so an unauthenticated
  //    caller cannot force expensive JSON parsing or DB round trips.
  const provided = extractProvidedSecret(req);
  if (!provided || !safeEqual(provided, WEBHOOK_SECRET)) {
    console.warn("[receive-matteline-call] unauthorized");
    return json(401, { error: "unauthorized" });
  }

  let raw: MattelinePayload & Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const destination = (raw.destination_number || "").toString().trim();
  const phoneNormalized = normalizePhone(destination);
  const durationSec = toNumber(raw.call_duration);
  const score = toNumber(raw.deal_closure_percentage);

  if (!phoneNormalized && !raw.summarization && !raw.transcription) {
    return json(400, {
      error: "missing_fields",
      message: "Informe pelo menos destination_number ou summarization/transcription.",
    });
  }

  const callId = await computeCallId(raw, phoneNormalized);

  const nowISO = new Date().toISOString();
  const dados = {
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
    score,
    scheduling: (raw.scheduling || "").toString(),
    receivedAt: nowISO,
    source: "matteline",
    callId,
    raw,
  };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) Idempotent enqueue. `call_id` has a UNIQUE partial index — on retry the
  //    insert violates it and we return 200 with duplicate=true, without
  //    creating a second row or (later) re-triggering diagnosis.
  const { data: inserted, error: insErr } = await admin
    .from("interactions_inbound")
    .insert({ dados, phone_normalized: phoneNormalized || null, call_id: callId })
    .select("id")
    .single();

  if (insErr) {
    // Postgres unique_violation → treat as duplicate, not an error.
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      console.log("[receive-matteline-call] duplicate call_id, skipped", {
        callId, phoneNormalized: phoneNormalized || null,
      });
      return json(200, { ok: true, duplicate: true, callId });
    }
    console.error("[receive-matteline-call] insert_failed", {
      code, message: insErr.message,
    });
    return json(500, { error: "inbound_write_failed" });
  }

  console.log("[receive-matteline-call] queued", {
    id: inserted.id, callId, phoneNormalized: phoneNormalized || null,
  });

  return json(200, {
    ok: true,
    id: inserted.id,
    queued: true,
    callId,
    phoneNormalized,
  });
});
