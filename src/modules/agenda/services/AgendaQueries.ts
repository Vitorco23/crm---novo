// Agenda — consultas (somente leitura). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { GoogleEventsRange, GoogleEventsResult } from "./AgendaTypes";

export async function listGoogleEvents(range: GoogleEventsRange): Promise<GoogleEventsResult> {
  const { data, error } = await supabase.functions.invoke("list-google-events", { body: range });
  if (error) throw new Error(error.message);
  return (data ?? { events: [] }) as GoogleEventsResult;
}

export async function getGoogleCalendarStatus(): Promise<{ connected?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-calendar-status");
  if (error) throw new Error(error.message);
  return (data ?? {}) as { connected?: boolean; error?: string };
}
