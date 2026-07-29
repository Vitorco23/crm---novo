// Shared JWT auth guard for edge functions.
// Returns { ok: true, userId, email } when the request carries a valid
// Supabase user JWT, or { ok: false, response } with a 401 Response ready
// to return to the caller.

import { createClient } from "npm:@supabase/supabase-js@2";

export interface AuthOk {
  ok: true;
  userId: string;
  email?: string;
  claims: Record<string, unknown>;
}
export interface AuthFail {
  ok: false;
  response: Response;
}

export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthOk | AuthFail> {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      }),
    };
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: jsonHeaders,
      }),
    };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice(7).trim();
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as Record<string, unknown> | undefined;
  const sub = claims?.sub as string | undefined;
  if (error || !claims || !sub) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      }),
    };
  }
  return {
    ok: true,
    userId: sub,
    email: (claims.email as string | undefined) ?? undefined,
    claims,
  };
}
