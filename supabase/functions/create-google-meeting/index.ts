// Edge function: cria evento no Google Calendar via Connector Gateway
// e retorna { eventId, htmlLink, meetLink }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface RequestBody {
  summary: string;
  description?: string;
  startISO: string; // dateTime ISO
  endISO: string;   // dateTime ISO
  timeZone: string; // e.g. "America/Sao_Paulo"
  attendeeEmail?: string;
  calendarId?: string; // default "primary"
  withMeet?: boolean;  // default true
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isISODateTime(s: string): boolean {
  return !isNaN(new Date(s).getTime());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!GOOGLE_CALENDAR_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "google_calendar_not_connected",
          message: "Google Calendar não está conectado neste projeto.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as RequestBody;

    // ---- validation ----
    if (!body.summary || typeof body.summary !== "string" || body.summary.length > 300) {
      return new Response(JSON.stringify({ error: "invalid_summary" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.startISO || !isISODateTime(body.startISO)) {
      return new Response(JSON.stringify({ error: "invalid_startISO" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.endISO || !isISODateTime(body.endISO)) {
      return new Response(JSON.stringify({ error: "invalid_endISO" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.timeZone || typeof body.timeZone !== "string") {
      return new Response(JSON.stringify({ error: "invalid_timeZone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.attendeeEmail && !isEmail(body.attendeeEmail)) {
      return new Response(JSON.stringify({ error: "invalid_attendeeEmail" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendarId = encodeURIComponent(body.calendarId || "primary");
    const withMeet = body.withMeet !== false;

    const event: Record<string, unknown> = {
      summary: body.summary,
      description: body.description || "",
      start: { dateTime: body.startISO, timeZone: body.timeZone },
      end: { dateTime: body.endISO, timeZone: body.timeZone },
      reminders: { useDefault: true },
    };

    if (body.attendeeEmail) {
      event.attendees = [{ email: body.attendeeEmail }];
    }

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
    if (body.attendeeEmail) params.set("sendUpdates", "all");

    const url = `${GATEWAY_URL}/calendars/${calendarId}/events?${params.toString()}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Google Calendar API error", resp.status, data);
      return new Response(
        JSON.stringify({
          error: "google_api_error",
          status: resp.status,
          details: data?.error?.message || JSON.stringify(data),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meetLink: string | undefined =
      data?.hangoutLink ||
      data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;

    return new Response(
      JSON.stringify({
        eventId: data.id,
        htmlLink: data.htmlLink,
        meetLink: meetLink || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-google-meeting error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
