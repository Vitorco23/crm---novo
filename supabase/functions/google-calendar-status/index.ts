// Verifica se o Google Calendar está conectado e se as credenciais funcionam
import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");

  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return new Response(
      JSON.stringify({ connected: false, reason: "missing_env" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const resp = await fetch(
      "https://connector-gateway.lovable.dev/api/v1/verify_credentials",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        },
      }
    );
    const data = await resp.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        connected: resp.ok && (data.outcome === "verified" || data.outcome === "skipped"),
        outcome: data.outcome,
        error: data.error || null,
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
