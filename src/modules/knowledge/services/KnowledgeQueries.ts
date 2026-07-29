// Knowledge — consultas (somente leitura). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { KnowledgeDocument } from "./KnowledgeTypes";

export async function selectDocuments(): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeDocument[];
}

export async function selectChunkCounts(documentIds: string[]): Promise<Record<string, number>> {
  if (!documentIds.length) return {};
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("document_id")
    .in("document_id", documentIds);
  if (error) throw new Error(error.message);
  const map: Record<string, number> = {};
  (data ?? []).forEach((row: { document_id: string }) => {
    map[row.document_id] = (map[row.document_id] ?? 0) + 1;
  });
  return map;
}
