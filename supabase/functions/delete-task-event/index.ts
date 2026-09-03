// Deleta evento de tarefa no Google Calendar.
import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch, GoogleCalendarNotConnectedError } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const { eventId, calendarId } = (await req.json()) as { eventId: string; calendarId?: string };
    if (!eventId) {
      return new Response(JSON.stringify({ error: "invalid_eventId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const calId = encodeURIComponent(calendarId || "primary");
    const evId = encodeURIComponent(eventId);
    const resp = await googleCalendarFetch(`/calendars/${calId}/events/${evId}`, {
      method: "DELETE",
    });
    if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
      const details = await resp.text();
      console.error("delete-task-event error", resp.status, details);
      return new Response(JSON.stringify({ error: "google_api_error", status: resp.status, details }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
