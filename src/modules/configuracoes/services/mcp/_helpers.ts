// Shared helpers for MCP tools. Import-safe: no env reads or I/O at module top level.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadKey<T>(ctx: ToolContext, key: string, fallback: T): Promise<T> {
  const sb = supabaseForUser(ctx);
  const { data, error } = await sb
    .from("user_storage")
    .select("value")
    .eq("user_id", ctx.getUserId())
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T | undefined) ?? fallback;
}

export async function saveKey<T>(ctx: ToolContext, key: string, value: T): Promise<void> {
  const sb = supabaseForUser(ctx);
  const { error } = await sb.from("user_storage").upsert(
    { user_id: ctx.getUserId(), key, value: value as any, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) throw new Error(error.message);
}

export function text(payload: unknown, structured?: Record<string, unknown>) {
  const t = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text: t }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) throw new Error("Não autenticado");
}
