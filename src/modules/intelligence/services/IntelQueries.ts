// Intelligence — consultas (somente leitura). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { IntelConversation, IntelMessage } from "./IntelTypes";

export async function selectConversations(): Promise<IntelConversation[]> {
  const { data, error } = await supabase
    .from("intel_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as IntelConversation[];
}

export async function selectMessages(conversationId: string): Promise<IntelMessage[]> {
  const { data, error } = await supabase
    .from("intel_messages")
    .select("id, role, content, specialist, citations, model_used, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as IntelMessage[];
}
