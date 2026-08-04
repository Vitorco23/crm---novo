// Intelligence — mutações e chamadas de IA. Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type {
  AttachmentAnalysisInput,
  IntelConversation,
  IntelRouterRequest,
  IntelRouterResponse,
} from "./IntelTypes";

export async function insertConversation(title: string): Promise<IntelConversation> {
  const { data, error } = await supabase
    .from("intel_conversations")
    .insert({ title })
    .select("id, title, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as IntelConversation;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("intel_conversations").update({ title }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("intel_conversations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function askIntelRouter(payload: IntelRouterRequest): Promise<IntelRouterResponse> {
  const { data, error } = await supabase.functions.invoke("intel-router", { body: payload });
  if (error) throw new Error(error.message);
  return (data ?? {}) as IntelRouterResponse;
}

export async function analyzeAttachment(input: AttachmentAnalysisInput): Promise<{ content: string }> {
  const { data, error } = await supabase.functions.invoke("analyze-attachment", { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return { content: String(data?.content ?? "") };
}
