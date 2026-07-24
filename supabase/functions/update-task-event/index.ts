// Atualiza evento de tarefa no Google Calendar.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

const PRIORITY_COLOR: Record<string, string> = {
  baixa: "2", media: "5", alta: "6", urgente: "11",
};

interface Body {
  eventId: string;
  title?: string;
  description?: string;
  dueISO?: string;
  durationMin?: number;
  timeZone?: string;
  priority?: "baixa" | "media" | "alta" | "urgente";
  calendarId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
      return new Response(JSON.stringify({ error: "google_calendar_not_connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = (await req.json()) as Body;
    if (!body.eventId) {
      return new Response(JSON.stringify({ error: "invalid_eventId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const calendarId = encodeURIComponent(body.calendarId || "primary");
    const eventId = encodeURIComponent(body.eventId);

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.summary = `[Tarefa] ${body.title}`;
    if (body.description !== undefined) patch.description = body.description;
    if (body.priority) patch.colorId = PRIORITY_COLOR[body.priority] || "5";
    if (body.dueISO) {
      const start = new Date(body.dueISO);
      if (isNaN(start.getTime())) {
        return new Response(JSON.stringify({ error: "invalid_dueISO" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const durationMin = body.durationMin ?? 30;
      const end = new Date(start.getTime() + durationMin * 60 * 1000);
      const tz = body.timeZone || "America/Sao_Paulo";
      patch.start = { dateTime: start.toISOString(), timeZone: tz };
      patch.end = { dateTime: end.toISOString(), timeZone: tz };
    }

    const resp = await fetch(`${GATEWAY_URL}/calendars/${calendarId}/events/${eventId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("update-task-event error", resp.status, data);
      return new Response(JSON.stringify({
        error: "google_api_error", status: resp.status,
        details: data?.error?.message || JSON.stringify(data),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ eventId: data.id, htmlLink: data.htmlLink }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
