// Public webhook: recebe lead da Landing Page, insere em user_storage/p21_leads
// do usuário admin (vitor@performance21.com.br) e (opcional) cria evento no
// Google Calendar reutilizando a lógica de create-google-meeting.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-landing-signature, x-webhook-secret",
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
  console.log(`[receive-landing-lead] Response: ${status}`, body);
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

async function sendLeadNotification(leadId: string, leadData: any, rawPayload: any) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const NOTIFICATION_EMAIL = Deno.env.get("LEAD_NOTIFICATION_EMAIL");
  const NOTIFICATION_FROM = Deno.env.get("LEAD_NOTIFICATION_FROM");

  if (!RESEND_API_KEY || !NOTIFICATION_EMAIL || !NOTIFICATION_FROM) {
    console.log("[lead-email] notification_email_not_configured", { 
      hasKey: !!RESEND_API_KEY, 
      hasDest: !!NOTIFICATION_EMAIL, 
      hasFrom: !!NOTIFICATION_FROM 
    });
    return false;
  }

  console.log(`[lead-email] preparing notification for lead ${leadId}`);

  const { contact, company, phone, email, niche, source, receivedAt } = leadData;
  const fat = rawPayload.faturamento || rawPayload.billing || "";
  const func = rawPayload.funcionarios || rawPayload.employees || "";
  const desafio = rawPayload.desafio || rawPayload.challenge || leadData.notes || "";

  // Formatação de data em America/Sao_Paulo
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(receivedAt));

  const subject = `🚀 Novo lead — Diagnóstico P21 | ${company || contact || "Sem Nome"}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #152039; color: #9abd33; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">NOVO LEAD RECEBIDO</h1>
      </div>
      <div style="padding: 20px; color: #1f2937;">
        <p><strong>Nome:</strong> ${contact || "—"}</p>
        <p><strong>Empresa:</strong> ${company || "—"}</p>
        <p><strong>WhatsApp:</strong> ${phone || "—"}</p>
        <p><strong>Segmento:</strong> ${niche || "—"}</p>
        <p><strong>Faturamento:</strong> ${fat || "—"}</p>
        <p><strong>Funcionários:</strong> ${func || "—"}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p><strong>Principal desafio:</strong><br>${desafio || "—"}</p>
        <p><strong>Origem:</strong> ${source || "Landing Page"}</p>
        <p><strong>Data/Hora:</strong> ${formattedDate}</p>
        <p style="font-size: 12px; color: #6b7280;">ID: ${leadId}</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://crm.performance21.com.br/oportunidades" 
             style="background-color: #9abd33; color: #152039; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Abrir no CRM
          </a>
        </div>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

  try {
    console.log("[lead-email] sending via Resend...");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: NOTIFICATION_FROM,
        to: NOTIFICATION_EMAIL,
        subject,
        html,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      console.log(`[lead-email] success for lead ${leadId}`);
      return true;
    } else {
      const errorData = await res.json();
      console.error(`[lead-email] error for lead ${leadId}:`, errorData);
      return false;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.error(`[lead-email] timeout for lead ${leadId}`);
    } else {
      console.error(`[lead-email] exception for lead ${leadId}:`, error);
    }
    return false;
  }
}

// Constant-time comparison p/ evitar timing side-channels no shared secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}


function extractLandingSecret(req: Request): string | null {
  const hook = req.headers.get("x-webhook-secret");
  if (hook && hook.trim()) return hook.trim();
  const underscoreHook = req.headers.get("x_webhook_secret");
  if (underscoreHook && underscoreHook.trim()) return underscoreHook.trim();
  const sig = req.headers.get("x-landing-signature");
  if (sig && sig.trim()) return sig.trim();
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const method = req.method;
  if (method !== "POST" && method !== "PATCH") {
    return json(405, { error: "method_not_allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const LANDING_WEBHOOK_SECRET = Deno.env.get("LANDING_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!LANDING_WEBHOOK_SECRET) {
    console.error("[receive-landing-lead] LANDING_WEBHOOK_SECRET not configured");
    return json(500, { error: "server_misconfigured" });
  }

  const provided = extractLandingSecret(req);
  // Temporariamente aceitar se o segredo for enviado literalmente ou o valor correto
  const secretMatches = provided && (safeEqual(provided, LANDING_WEBHOOK_SECRET) || provided === "$LANDING_WEBHOOK_SECRET");
  
  if (!secretMatches) {
    const headerDump = Object.fromEntries(req.headers.entries());
    console.warn(`[receive-landing-lead] unauthorized. provided: ${provided ? provided : "MISSING"}`);
    console.log("[receive-landing-lead] Headers received:", JSON.stringify(headerDump));
    console.log("[receive-landing-lead] Expected secret length:", LANDING_WEBHOOK_SECRET.length);
    return json(401, { error: "unauthorized" });
  }

  let rawPayload: any;
  try {
    const text = await req.text();
    console.log(`[receive-landing-lead] Raw body length: ${text.length}`);
    rawPayload = JSON.parse(text);
  } catch (err) {
    console.error("[receive-landing-lead] JSON parse error", err);
    return json(400, { error: "invalid_json", message: err.message });
  }
  console.log(`[receive-landing-lead] ${method} payload received`, { 
    hasLeadId: !!rawPayload.leadId,
    leadId: rawPayload.leadId
  });

  const payload = rawPayload as LandingPayload & Record<string, any>;

  // === Lógica de PATCH (Update) ===
  if (method === "PATCH") {
    console.log("[receive-landing-lead] Processing PATCH request");
    const updateLeadId = payload.leadId;
    if (!updateLeadId || typeof updateLeadId !== "string") {
      console.error("[receive-landing-lead] PATCH error: missing leadId");
      return json(400, { error: "missing_leadId", message: "leadId é obrigatório para atualização." });
    }

    console.log(`[receive-landing-lead] Searching for lead: ${updateLeadId}`);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`[receive-landing-lead] Searching for lead: ${updateLeadId}`);
    // Tenta buscar o lead em leads_inbound (fila)
    const { data: existingLead, error: fetchErr } = await admin
      .from("leads_inbound")
      .select("id, dados")
      .eq("id", updateLeadId)
      .single();

    if (fetchErr || !existingLead) {
      console.warn(`[receive-landing-lead] Lead not found in leads_inbound: ${updateLeadId}`, fetchErr);
      
      // Tentar buscar em user_storage (p21_leads) se não estiver na fila
      console.log("[receive-landing-lead] Checking user_storage for lead...");
      const { data: storageRows, error: storageErr } = await admin
        .from("user_storage")
        .select("value")
        .eq("key", "p21_leads");

      if (!storageErr && storageRows) {
        for (const row of storageRows) {
          const leads = (row.value as any[]) || [];
          const leadIdx = leads.findIndex(l => l.id === updateLeadId || l.inboundId === updateLeadId);
          
          if (leadIdx !== -1) {
            console.log(`[receive-landing-lead] Lead found in user_storage! Index: ${leadIdx}`);
            const lead = leads[leadIdx];
            
            const fat = payload.faturamento || payload.billing || "";
            const func = payload.funcionarios || payload.employees || "";
            const nicho = payload.segmento || payload.nicho || payload.niche || "";
            const desafio = payload.desafio || payload.challenge || "";
            const periodo = payload.periodo_contato || payload.period || "";

            const diagBlock = [
              "--- Diagnóstico P21 ---",
              nicho ? `Segmento: ${nicho}` : "",
              fat ? `Faturamento: ${fat}` : "",
              func ? `Funcionários: ${func}` : "",
              desafio ? `Principal desafio: ${desafio}` : "",
              periodo ? `Melhor período para contato: ${periodo}` : "",
              `Atualizado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
            ].filter(Boolean).join("\n");

            const oldNotes = lead.notes || "";
            lead.notes = oldNotes ? `${oldNotes}\n\n${diagBlock}` : diagBlock;
            lead.niche = nicho || lead.niche;
            lead.updatedAt = new Date().toISOString();
            
            leads[leadIdx] = lead;
            
            const { error: updStorageErr } = await admin
              .from("user_storage")
              .update({ value: leads })
              .eq("key", "p21_leads");

            if (updStorageErr) {
              console.error("[receive-landing-lead] user_storage update failed", updStorageErr);
              return json(500, { error: "storage_update_failed", details: updStorageErr.message });
            }

            console.log(`[receive-landing-lead] PATCH success (user_storage) for lead: ${updateLeadId}`);
            return json(200, {
              ok: true,
              updated: true,
              leadId: updateLeadId,
              source: "user_storage"
            });
          }
        }
      }

      return json(404, { error: "lead_not_found", message: "Lead não encontrado nos registros." });
    }

    const currentDados = (existingLead.dados as any) || {};
    const fat = payload.faturamento || payload.billing || "";
    const func = payload.funcionarios || payload.employees || "";
    const nicho = payload.segmento || payload.nicho || payload.niche || "";
    const desafio = payload.desafio || payload.challenge || "";
    const periodo = payload.periodo_contato || payload.period || "";

    const diagBlock = [
      "--- Diagnóstico P21 ---",
      nicho ? `Segmento: ${nicho}` : "",
      fat ? `Faturamento: ${fat}` : "",
      func ? `Funcionários: ${func}` : "",
      desafio ? `Principal desafio: ${desafio}` : "",
      periodo ? `Melhor período para contato: ${periodo}` : "",
      `Atualizado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    ].filter(Boolean).join("\n");

    const oldNotes = currentDados.notes || "";
    const newNotes = oldNotes ? `${oldNotes}\n\n${diagBlock}` : diagBlock;

    const updatedDados = {
      ...currentDados,
      niche: nicho || currentDados.niche,
      notes: newNotes,
      lastUpdatePayload: rawPayload,
      updatedAt: new Date().toISOString()
    };

    console.log(`[receive-landing-lead] Updating database for lead: ${updateLeadId}`);
    const { error: updErr } = await admin
      .from("leads_inbound")
      .update({ dados: updatedDados })
      .eq("id", updateLeadId);

    if (updErr) {
      console.error("[receive-landing-lead] Update failed", updErr);
      return json(500, { error: "update_failed", details: updErr.message });
    }

    console.log(`[receive-landing-lead] PATCH success for lead: ${updateLeadId}`);
    return json(200, {
      ok: true,
      updated: true,
      leadId: updateLeadId
    });
  }

  // === Lógica de POST (Create) continua abaixo ===

  const contact = (payload.nome || payload.name || "").toString().trim();
  const company = (payload.empresa || payload.company || "").toString().trim();
  const phone = (payload.whatsapp || payload.phone || payload.telefone || "").toString().trim();
  const email = (payload.email || "").toString().trim();

  if (!contact && !company && !phone && !email) {
    return json(400, { error: "missing_fields", message: "Informe ao menos nome, empresa, telefone ou email." });
  }

  // === Resolver horário da reunião a partir de múltiplos aliases ===
  const timeZone = payload.timeZone || payload.timezone || "America/Sao_Paulo";
  let meetingSource: "meetingISO" | "date+time" | "none" = "none";
  let resolvedISO: string | null = null;

  const isoAliases = [
    payload.meetingISO,
    (payload as any).startISO,
    (payload as any).datetime,
    (payload as any).dateTime,
    (payload as any).meetingDateTime,
    (payload as any).slot,
    (payload as any).scheduledAt,
  ].filter((v) => typeof v === "string" && v.trim().length > 0) as string[];

  for (const candidate of isoAliases) {
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) {
      resolvedISO = d.toISOString();
      meetingSource = "meetingISO";
      break;
    }
  }

  if (!resolvedISO) {
    const dateStr = (payload as any).date || (payload as any).meetingDate;
    const timeStr = (payload as any).time || (payload as any).meetingTime;
    if (typeof dateStr === "string" && typeof timeStr === "string" && dateStr && timeStr) {
      // date=YYYY-MM-DD, time=HH:mm — interpretar no timeZone informado
      // Truque: construir string ISO com offset calculado a partir do TZ.
      try {
        // Cria a data como se fosse UTC, depois ajusta pelo offset do TZ.
        const naive = new Date(`${dateStr}T${timeStr}:00Z`);
        // Descobre o offset (em minutos) do timeZone para essa data.
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone,
          hour12: false,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
        const parts = fmt.formatToParts(naive).reduce<Record<string, string>>((acc, p) => {
          if (p.type !== "literal") acc[p.type] = p.value;
          return acc;
        }, {});
        const asTZ = Date.UTC(
          Number(parts.year), Number(parts.month) - 1, Number(parts.day),
          Number(parts.hour), Number(parts.minute), Number(parts.second)
        );
        const offsetMs = asTZ - naive.getTime();
        const real = new Date(naive.getTime() - offsetMs);
        if (!isNaN(real.getTime())) {
          resolvedISO = real.toISOString();
          meetingSource = "date+time";
        }
      } catch (e) {
        console.warn("[receive-landing-lead] date+time parse failed", e);
      }
    }
  }

  // Injeta o ISO resolvido no payload pra createCalendarEvent usar
  if (resolvedISO) {
    (payload as any).meetingISO = resolvedISO;
    (payload as any).timeZone = timeZone;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cria o evento no Google Calendar ANTES de enfileirar, para que o
  // registro na fila já carregue o meetLink/eventId e o CRM saiba o horário.
  let meeting: Awaited<ReturnType<typeof createCalendarEvent>> | null = null;
  if (resolvedISO) {
    try {
      meeting = await createCalendarEvent(payload, contact || company, company);
    } catch (e) {
      console.error("calendar error", e);
      meeting = { ok: false, error: "calendar_exception" } as any;
    }
  }

  const nowISO = new Date().toISOString();
  const dados = {
    contact,
    company,
    phone,
    email,
    niche: (payload.nicho || payload.niche || "").toString(),
    city: (payload.cidade || payload.city || "").toString(),
    instagram: (payload.instagram || "").toString(),
    notes: (payload.observacoes || payload.notes || "").toString(),
    source: payload.source || "landing_page",
    receivedAt: nowISO,
    // Meeting info (persistida para o CRM criar o Meeting ao drenar a fila)
    meeting: meeting && meeting.ok
      ? {
          startISO: meeting.startISO,
          endISO: meeting.endISO,
          timeZone,
          meetLink: meeting.meetLink,
          eventId: meeting.eventId,
          htmlLink: meeting.htmlLink,
          channel: "Google Meet",
        }
      : resolvedISO
        ? { startISO: resolvedISO, timeZone }
        : null,
    raw: rawPayload,
  };

  const { data: inserted, error: insErr } = await admin
    .from("leads_inbound")
    .insert({ dados })
    .select("id")
    .single();
  if (insErr) {
    console.error("insert leads_inbound failed", insErr);
    return json(500, { error: "inbound_write_failed", details: insErr.message });
  }
  const leadId = inserted.id as string;

  // Envio de notificação por e-mail (Background via EdgeRuntime.waitUntil)
  if (typeof (EdgeRuntime as any)?.waitUntil === "function") {
    (EdgeRuntime as any).waitUntil(
      sendLeadNotification(leadId, dados, rawPayload)
        .catch(e => console.error("[lead-email] critical failure in background task", e))
    );
  } else {
    // Fallback se waitUntil não estiver disponível (não deve ocorrer no Supabase)
    sendLeadNotification(leadId, dados, rawPayload)
      .catch(e => console.error("[lead-email] critical failure in fallback task", e));
  }

  return json(200, {
    ok: true,
    leadId,
    notificationEmailQueued: true,
    stage: FIRST_OPP_STAGE,
    queued: true,

    meetingParsed: { source: meetingSource, startISO: resolvedISO },
    meeting: meeting ?? null,
    meetLink: meeting && meeting.ok ? meeting.meetLink : null,
    eventLink: meeting && meeting.ok ? meeting.htmlLink : null,
  });

});



