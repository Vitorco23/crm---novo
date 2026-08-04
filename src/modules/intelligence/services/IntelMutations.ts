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
  
  if (error) {
    let details = error.message;
    let code = "UNKNOWN";
    let status = 500;
    
    try {
      // @ts-ignore
      if (error.context) {
        status = error.context.status || 500;
        const text = await error.context.text();
        try {
          const parsed = JSON.parse(text);
          details = parsed.message || parsed.error || details;
          code = parsed.code || code;
        } catch {
          details = text || details;
        }
      }
    } catch { /* noop */ }

    throw new Error(`[Edge Function: intel-router] ${status}: ${details} (${code})`);
  }
  
  return (data ?? {}) as IntelRouterResponse;
}

export async function analyzeAttachment(input: AttachmentAnalysisInput): Promise<{ content: string }> {
  const { data, error } = await supabase.functions.invoke("analyze-attachment", { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return { content: String(data?.content ?? "") };
}
