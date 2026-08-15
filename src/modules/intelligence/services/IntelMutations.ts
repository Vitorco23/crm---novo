// Intelligence — mutações e chamadas de IA. Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { AttachmentAnalysisInput } from "./IntelTypes";

export async function analyzeAttachment(input: AttachmentAnalysisInput): Promise<{ content: string }> {
  const { data, error } = await supabase.functions.invoke("analyze-attachment", { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return { content: String(data?.content ?? "") };
}
