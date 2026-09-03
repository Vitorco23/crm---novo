// Edge function: atualiza data/horário de um evento no Google Calendar
import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch, GoogleCalendarNotConnectedError } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
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

    const resp = await googleCalendarFetch(`/calendars/${calendarId}/events/${eventId}?${params.toString()}`, {
      method: "PATCH",
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
    if (err instanceof GoogleCalendarNotConnectedError) {
      return new Response(JSON.stringify({ error: "google_calendar_not_connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
