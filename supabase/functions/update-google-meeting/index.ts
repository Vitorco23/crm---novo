// Edge function: atualiza data/horário de um evento no Google Calendar
import { requireUser } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface RequestBody {
  eventId: string;
  startISO: string;
  endISO: string;
  timeZone: string;
  calendarId?: string;
  sendUpdates?: boolean;
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
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!GOOGLE_CALENDAR_API_KEY) {
      return new Response(
        JSON.stringify({ error: "google_calendar_not_connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body.eventId) {
      return new Response(JSON.stringify({ error: "invalid_eventId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.startISO || !isISODateTime(body.startISO) || !body.endISO || !isISODateTime(body.endISO)) {
      return new Response(JSON.stringify({ error: "invalid_dates" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.timeZone) {
      return new Response(JSON.stringify({ error: "invalid_timeZone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendarId = encodeURIComponent(body.calendarId || "primary");
    const eventId = encodeURIComponent(body.eventId);
    const params = new URLSearchParams();
    params.set("sendUpdates", body.sendUpdates === false ? "none" : "all");

    const url = `${GATEWAY_URL}/calendars/${calendarId}/events/${eventId}?${params.toString()}`;

    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: body.startISO, timeZone: body.timeZone },
        end: { dateTime: body.endISO, timeZone: body.timeZone },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Google Calendar PATCH error", resp.status, data);
      return new Response(
        JSON.stringify({
          error: "google_api_error",
          status: resp.status,
          details: data?.error?.message || JSON.stringify(data),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ eventId: data.id, htmlLink: data.htmlLink }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
