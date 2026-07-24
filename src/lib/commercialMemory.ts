// Cliente da Memória Comercial — leitura pelo owner e disparo de extração.
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/lib/store";

export type MemoryKind =
  | "won_pattern"
  | "lost_pattern"
  | "objection_handled"
  | "niche_insight"
  | "sequence_insight";

export interface CommercialMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  confidence: number;
  usage_count: number;
  approved: boolean;
  source_lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  won_pattern: "Padrão de Vitória",
  lost_pattern: "Padrão de Perda",
  objection_handled: "Objeção Superada",
  niche_insight: "Insight de Nicho",
  sequence_insight: "Sequência que Funciona",
};

export async function listMemories(filters?: { kind?: MemoryKind; search?: string }): Promise<CommercialMemory[]> {
  let q = supabase.from("commercial_memory" as never).select("*").order("created_at", { ascending: false }).limit(500);
  if (filters?.kind) q = q.eq("kind", filters.kind);
  if (filters?.search) q = q.ilike("title", `%${filters.search}%`);
  const { data, error } = await q;
  if (error) { console.warn(error); return []; }
  return (data ?? []) as unknown as CommercialMemory[];
}

export async function updateMemory(id: string, patch: Partial<Pick<CommercialMemory, "title" | "content" | "approved">>) {
  const { error } = await (supabase.from("commercial_memory" as never) as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteMemory(id: string) {
  const { error } = await (supabase.from("commercial_memory" as never) as never).delete().eq("id", id);
  if (error) throw error;
}

function leadContextText(lead: Lead): string {
  const notes = (lead.callNotes || [])
    .slice(-6)
    .map((n, i) => `[${i + 1}] ${(n.text || "").slice(0, 500)}`)
    .join("\n");
  return [
    `Empresa: ${lead.company || "N/D"}`,
    `Nicho: ${lead.niche || "N/D"}`,
    `Cidade: ${lead.city || "N/D"}`,
    `Etapa: ${lead.stage || "N/D"}`,
    `Tentativas: ${lead.callNotes?.length ?? 0}`,
    `Tipo de serviço: ${lead.serviceType || "N/D"}`,
    `Valor de contrato: ${lead.contractValue ? `R$ ${lead.contractValue}` : "N/D"}`,
    `ICP: ${lead.icpStars ?? "N/D"} estrelas`,
    `Observações:\n${(lead.notes || "").slice(0, 800)}`,
    `Últimas ligações:\n${notes || "(sem ligações)"}`,
  ].join("\n");
}

/** Fire-and-forget: extrai memória a partir de um Lead. */
export function extractMemoryFromLead(kind: MemoryKind, lead: Lead, extraContext?: string) {
  const context = extraContext ? `${leadContextText(lead)}\n\n${extraContext}` : leadContextText(lead);
  const metadata = {
    niche: lead.niche || null,
    city: lead.city || null,
    serviceType: lead.serviceType || null,
    stage: lead.stage || null,
    contractValue: lead.contractValue || null,
  };
  supabase.functions
    .invoke("extract-memory", { body: { kind, context, leadId: lead.id, metadata } })
    .then(({ error }) => { if (error) console.warn("[extract-memory]", error.message); })
    .catch((e) => console.warn("[extract-memory]", e?.message));
}

/** Consolida memórias por nicho: chama extract-memory para o nicho mais ativo. */
export async function consolidateNicheInsights(leads: Lead[]) {
  const byNiche = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!l.niche) continue;
    const arr = byNiche.get(l.niche) || [];
    arr.push(l);
    byNiche.set(l.niche, arr);
  }
  const promises: Promise<unknown>[] = [];
  for (const [niche, group] of byNiche) {
    if (group.length < 5) continue;
    const won = group.filter((l) => (l.stage || "").toLowerCase().includes("ganho")).length;
    const lost = group.filter((l) => /não quer|perdido|sem contato/i.test(l.stage || "")).length;
    const avgAttempts = group.reduce((s, l) => s + (l.callNotes?.length ?? 0), 0) / group.length;
    const context = [
      `Nicho: ${niche}`,
      `Total de leads: ${group.length}`,
      `Fechados (Ganho): ${won}`,
      `Perdidos: ${lost}`,
      `Média de tentativas: ${avgAttempts.toFixed(1)}`,
      `Amostra de empresas: ${group.slice(0, 8).map((l) => l.company).join(", ")}`,
    ].join("\n");
    promises.push(
      supabase.functions.invoke("extract-memory", {
        body: { kind: "niche_insight", context, metadata: { niche, sample_size: group.length } },
      }).then(() => {}, () => {}),
    );
  }
  await Promise.all(promises);
  return promises.length;
}
