// Public webhook: recebe lead da Landing Page, insere em user_storage/p21_leads
// do usuário admin (vitor@performance21.com.br) e (opcional) cria evento no
// Google Calendar reutilizando a lógica de create-google-meeting.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_EMAIL = "vitor@performance21.com.br";
const FIRST_OPP_STAGE = "Reunião Marcada";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface LandingPayload {
  nome?: string;
  name?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
  telefone?: string;
  empresa?: string;
  company?: string;
  nicho?: string;
  niche?: string;
  cidade?: string;
  city?: string;
  instagram?: string;
  observacoes?: string;
  notes?: string;
  // agenda
  meetingISO?: string;      // início ISO
  meetingEndISO?: string;   // fim opcional
  durationMinutes?: number; // usado se não houver meetingEndISO
  timeZone?: string;        // default America/Sao_Paulo
  withMeet?: boolean;       // default true
  source?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createCalendarEvent(payload: LandingPayload, leadName: string, company: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return { ok: false, error: "google_calendar_not_connected" as const };
  }
  if (!payload.meetingISO || isNaN(new Date(payload.meetingISO).getTime())) {
    return { ok: false, error: "invalid_meetingISO" as const };
  }

  const start = new Date(payload.meetingISO);
  const end =
    payload.meetingEndISO && !isNaN(new Date(payload.meetingEndISO).getTime())
      ? new Date(payload.meetingEndISO)
      : new Date(start.getTime() + (payload.durationMinutes ?? 30) * 60_000);

  const timeZone = payload.timeZone || "America/Sao_Paulo";
  const withMeet = payload.withMeet !== false;

  const event: Record<string, unknown> = {
    summary: `Reunião — ${company || leadName || "Landing Page"}`,
    description: `Lead recebido via Landing Page.\nContato: ${leadName}\nEmpresa: ${company}\nEmail: ${payload.email || ""}\nWhatsApp: ${payload.whatsapp || payload.phone || payload.telefone || ""}`,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    reminders: { useDefault: true },
  };
  if (payload.email) event.attendees = [{ email: payload.email }];
  if (withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const params = new URLSearchParams();
  if (withMeet) params.set("conferenceDataVersion", "1");
  if (payload.email) params.set("sendUpdates", "all");

  const resp = await fetch(
    `${GATEWAY_URL}/calendars/primary/events?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Google Calendar API error", resp.status, data);
    return { ok: false as const, error: "google_api_error", status: resp.status, details: data };
  }
  const meetLink: string | undefined =
    data?.hangoutLink ||
    data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;
  return {
    ok: true as const,
    eventId: data.id as string,
    htmlLink: data.htmlLink as string,
    meetLink: meetLink || null,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
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

  let payload: LandingPayload;
  try {
    payload = (await req.json()) as LandingPayload;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const contact = (payload.nome || payload.name || "").toString().trim();
  const company = (payload.empresa || payload.company || "").toString().trim();
  const phone = (payload.whatsapp || payload.phone || payload.telefone || "").toString().trim();
  const email = (payload.email || "").toString().trim();

  if (!contact && !company && !phone && !email) {
    return json(400, { error: "missing_fields", message: "Informe ao menos nome, empresa, telefone ou email." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Localizar user_id do dono pelo email
  const { data: userList, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) {
    console.error("listUsers error", usersErr);
    return json(500, { error: "auth_lookup_failed", details: usersErr.message });
  }
  const owner = userList?.users?.find(
    (u) => (u.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
  if (!owner) {
    return json(404, { error: "owner_not_found", email: OWNER_EMAIL });
  }
  const userId = owner.id;

  // 2. Buscar p21_leads atual
  const { data: existing, error: selErr } = await admin
    .from("user_storage")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "p21_leads")
    .maybeSingle();
  if (selErr) {
    console.error("select p21_leads failed", selErr);
    return json(500, { error: "storage_read_failed", details: selErr.message });
  }
  const currentLeads: any[] = Array.isArray(existing?.value) ? (existing!.value as any[]) : [];

  // 3. Montar novo lead
  const nowISO = new Date().toISOString();
  const leadId =
    (globalThis.crypto?.randomUUID?.() as string | undefined) ||
    `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const newLead = {
    id: leadId,
    company: company || contact || "Sem nome",
    contact: contact || "",
    phone,
    email,
    niche: (payload.nicho || payload.niche || "").toString(),
    city: (payload.cidade || payload.city || "").toString(),
    gmnLink: "",
    instagramLink: (payload.instagram || "").toString(),
    icpStars: 2,
    runsAds: false,
    stage: FIRST_OPP_STAGE,
    createdAt: nowISO,
    stageChangedAt: nowISO,
    notes: [
      payload.observacoes || payload.notes || "",
      `Origem: Landing Page${payload.source ? ` (${payload.source})` : ""}`,
    ].filter(Boolean).join("\n"),
    attachments: [],
    callNotes: [],
    source: "landing_page",
  };

  const updatedLeads = [newLead, ...currentLeads];

  // 4. Update / upsert
  const { error: upErr } = await admin
    .from("user_storage")
    .upsert(
      { user_id: userId, key: "p21_leads", value: updatedLeads, updated_at: nowISO },
      { onConflict: "user_id,key" }
    );
  if (upErr) {
    console.error("upsert p21_leads failed", upErr);
    return json(500, { error: "storage_write_failed", details: upErr.message });
  }

  // 5. Google Calendar (opcional)
  let meeting: Awaited<ReturnType<typeof createCalendarEvent>> | null = null;
  if (payload.meetingISO) {
    try {
      meeting = await createCalendarEvent(payload, contact || company, company);
    } catch (e) {
      console.error("calendar error", e);
      meeting = { ok: false, error: "calendar_exception" } as any;
    }
  }

  return json(200, {
    ok: true,
    leadId,
    stage: FIRST_OPP_STAGE,
    totalLeads: updatedLeads.length,
    meeting: meeting ?? null,
    meetLink: meeting && meeting.ok ? meeting.meetLink : null,
    eventLink: meeting && meeting.ok ? meeting.htmlLink : null,
  });
});
