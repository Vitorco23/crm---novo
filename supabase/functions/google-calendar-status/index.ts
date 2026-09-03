// Verifica se o Google Calendar está conectado e se as credenciais funcionam
import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch, isGoogleCalendarConfigured } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  if (!isGoogleCalendarConfigured()) {
    return new Response(
      JSON.stringify({ connected: false, reason: "missing_env" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Chamada leve só pra confirmar que o refresh_token ainda é válido.
    const resp = await googleCalendarFetch("/calendars/primary");
    const data = await resp.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        connected: resp.ok,
        outcome: resp.ok ? "verified" : "failed",
        error: resp.ok ? null : (data?.error?.message || null),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ connected: false, reason: "network_error", error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
