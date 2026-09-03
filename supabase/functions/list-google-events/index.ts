// Lista eventos do Google Calendar em uma janela de tempo.
import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch, GoogleCalendarNotConnectedError } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  timeMin: string;
  timeMax: string;
  calendarId?: string;
  timeZone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json()) as Body;
    if (!body.timeMin || !body.timeMax) {
      return new Response(JSON.stringify({ error: "invalid_range" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const calendarId = encodeURIComponent(body.calendarId || "primary");
    const params = new URLSearchParams({
      timeMin: new Date(body.timeMin).toISOString(),
      timeMax: new Date(body.timeMax).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (body.timeZone) params.set("timeZone", body.timeZone);

    const resp = await googleCalendarFetch(`/calendars/${calendarId}/events?${params.toString()}`, {
      method: "GET",
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("list-google-events error", resp.status, data);
      return new Response(JSON.stringify({
        error: "google_api_error", status: resp.status,
        details: data?.error?.message || JSON.stringify(data), events: [],
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const events = (data.items || []).map((ev: any) => ({
      id: ev.id,
      summary: ev.summary || "(sem título)",
      description: ev.description || "",
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !!ev.start?.date && !ev.start?.dateTime,
      htmlLink: ev.htmlLink,
      hangoutLink: ev.hangoutLink,
      colorId: ev.colorId,
      isTask: !!ev.extendedProperties?.private?.p21_task || /^\[Tarefa\]/i.test(ev.summary || ""),
      priority: ev.extendedProperties?.private?.p21_priority,
      status: ev.status,
    }));
    return new Response(JSON.stringify({ events }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError) {
      return new Response(JSON.stringify({ error: "google_calendar_not_connected", events: [] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "internal_error", message, events: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
