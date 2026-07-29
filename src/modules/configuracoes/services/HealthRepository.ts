// Configurações — dados de observabilidade (Saúde do Sistema). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeSnapshotRow {
  categoria: string | null;
  updated_at: string | null;
  created_at: string | null;
}

export interface AiRouterLogRow {
  task: string | null;
  model: string | null;
  success: boolean;
  latency_ms: number | null;
  error_type: string | null;
  created_at: string;
}

export interface KnowledgeHealthSnapshot {
  pingError: boolean;
  docCount: number | null;
  versionCount: number | null;
  docs: KnowledgeSnapshotRow[];
}

export const HealthRepository = {
  async pingDatabase(): Promise<{ ok: boolean; latency: number }> {
    const t0 = performance.now();
    const { error } = await supabase.from("knowledge_documents").select("id", { count: "exact", head: true });
    return { ok: !error, latency: Math.round(performance.now() - t0) };
  },

  async knowledgeSnapshot(): Promise<Omit<KnowledgeHealthSnapshot, "pingError">> {
    const [{ count: docCount }, { data: docs }, { count: versionCount }] = await Promise.all([
      supabase.from("knowledge_documents").select("id", { count: "exact", head: true }),
      supabase
        .from("knowledge_documents")
        .select("categoria, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase.from("knowledge_document_versions").select("id", { count: "exact", head: true }),
    ]);
    return {
      docCount: docCount ?? null,
      versionCount: versionCount ?? null,
      docs: (docs ?? []) as KnowledgeSnapshotRow[],
    };
  },

  async aiRouterLogs(sinceISO: string): Promise<AiRouterLogRow[]> {
    const { data } = await supabase
      .from("ai_router_logs")
      .select("task, model, success, latency_ms, error_type, created_at")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []) as AiRouterLogRow[];
  },
};

export type HealthRepositoryType = typeof HealthRepository;
