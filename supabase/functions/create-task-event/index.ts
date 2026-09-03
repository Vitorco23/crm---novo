// Cria evento de TAREFA no Google Calendar via Connector Gateway.
// Diferente de reuniões: sem Meet, com colorId por prioridade e prefixo [Tarefa].
import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch, GoogleCalendarNotConnectedError } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRIORITY_COLOR: Record<string, string> = {
  baixa: "2",
  media: "5",
  alta: "6",
  urgente: "11",
};

interface Body {
  title: string;
  description?: string;
  dueISO: string;
  durationMin?: number;
  timeZone?: string;
  priority?: "baixa" | "media" | "alta" | "urgente";
  calendarId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json()) as Body;
    if (!body.title || !body.dueISO) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const start = new Date(body.dueISO);
    if (isNaN(start.getTime())) {
      return new Response(JSON.stringify({ error: "invalid_dueISO" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const durationMin = body.durationMin ?? 30;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    const timeZone = body.timeZone || "America/Sao_Paulo";
    const calendarId = encodeURIComponent(body.calendarId || "primary");

    const event: Record<string, unknown> = {
      summary: `[Tarefa] ${body.title}`,
      description: body.description || "",
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      colorId: PRIORITY_COLOR[body.priority || "media"] || "5",
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 15 }],
      },
      extendedProperties: {
        private: { p21_task: "1", p21_priority: body.priority || "media" },
      },
    };

    const resp = await googleCalendarFetch(`/calendars/${calendarId}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Google Calendar create-task error", resp.status, data);
      return new Response(JSON.stringify({
        error: "google_api_error", status: resp.status,
        details: data?.error?.message || JSON.stringify(data),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ eventId: data.id, htmlLink: data.htmlLink }), {
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
