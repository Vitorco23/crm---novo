// Knowledge — mutações (INSERT/UPDATE/DELETE/Edge Functions). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { KnowledgeDocumentPayload, KnowledgeImportResult } from "./KnowledgeTypes";

export async function insertDocument(payload: KnowledgeDocumentPayload): Promise<string> {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert(payload as any)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateDocument(id: string, payload: KnowledgeDocumentPayload): Promise<void> {
  const { error } = await supabase.from("knowledge_documents").update(payload as any).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function indexDocument(documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("knowledge-index", { body: { documentId } });
  if (error) throw new Error(error.message);
}

export async function importFile(filename: string, fileBase64: string): Promise<KnowledgeImportResult> {
  const { data, error } = await supabase.functions.invoke("knowledge-import", {
    body: { filename, fileBase64 },
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as KnowledgeImportResult;
}
