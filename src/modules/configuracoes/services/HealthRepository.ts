// Configurações — dados de observabilidade (Saúde do Sistema). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";

export interface AiRouterLogRow {
  task: string | null;
  model: string | null;
  success: boolean;
  latency_ms: number | null;
  error_type: string | null;
  created_at: string;
}

export const HealthRepository = {
  async pingDatabase(): Promise<{ ok: boolean; latency: number }> {
    const t0 = performance.now();
    const { error } = await supabase.from("ai_router_logs").select("id", { count: "exact", head: true });
    return { ok: !error, latency: Math.round(performance.now() - t0) };
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
