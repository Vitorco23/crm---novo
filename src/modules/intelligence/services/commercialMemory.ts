// Cliente da Memória Comercial — leitura pelo owner e disparo de extração.
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/shared/services/store";

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
  let q = supabase.from("commercial_memory").select("*").order("created_at", { ascending: false }).limit(500);
  if (filters?.kind) q = q.eq("kind", filters.kind);
  if (filters?.search) q = q.ilike("title", `%${filters.search}%`);
  const { data, error } = await q;
  if (error) { console.warn(error); return []; }
  return (data ?? []) as unknown as CommercialMemory[];
}

export async function updateMemory(id: string, patch: Partial<Pick<CommercialMemory, "title" | "content" | "approved">>) {
  const { error } = await supabase.from("commercial_memory").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMemory(id: string) {
  const { error } = await supabase.from("commercial_memory").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Enriquecimento do contexto do Lead: captura AUTOMÁTICA de
// nicho, cidade, origem/campanha, #ligações, #reuniões, duração,
// etapa final, motivos e objeções — para alimentar o motor de
// padrões da Memória Comercial.
// ============================================================
function daysBetween(a: string, b: string): number {
  try {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  } catch { return 0; }
}

function extractSignalsFromInteractions(lead: Lead) {
  const inters = lead.interactions || [];
  const meetingsCount = inters.filter((i) =>
    /reuni[aã]o|meeting|apresenta[cç][aã]o|diagn[oó]stico/i.test(i.type || "")
  ).length;
  const wpCount = inters.filter((i) => /whatsapp|mensagem|e-?mail/i.test(i.type || "")).length;
  // Heurística leve: objeções/argumentos mencionados em resumos
  const objecoes: string[] = [];
  const argumentos: string[] = [];
  for (const i of inters) {
    const t = `${i.title || ""}\n${i.summary || ""}\n${i.sellerNotes || ""}`;
    const objMatch = t.match(/objec[aã]o[:\-]\s*([^\n.;]+)/gi);
    if (objMatch) objecoes.push(...objMatch.map((s) => s.replace(/objec[aã]o[:\-]\s*/i, "").trim()).slice(0, 3));
    const argMatch = t.match(/argumento[:\-]\s*([^\n.;]+)/gi);
    if (argMatch) argumentos.push(...argMatch.map((s) => s.replace(/argumento[:\-]\s*/i, "").trim()).slice(0, 3));
  }
  return { meetingsCount, wpCount, objecoes: objecoes.slice(0, 5), argumentos: argumentos.slice(0, 5) };
}

function leadContextText(lead: Lead): string {
  const callsCount = lead.callNotes?.length ?? 0;
  const { meetingsCount, wpCount, objecoes, argumentos } = extractSignalsFromInteractions(lead);
  const durationDays = daysBetween(lead.createdAt, new Date().toISOString());
  const notes = (lead.callNotes || [])
    .slice(-6)
    .map((n, i) => `[${i + 1}] ${(n.text || "").slice(0, 400)}`)
    .join("\n");
  const inters = (lead.interactions || [])
    .slice(-6)
    .map((i, idx) => `[${idx + 1}] ${i.date?.slice(0, 10) || ""} ${i.type}: ${(i.summary || i.title || "").slice(0, 300)}`)
    .join("\n");
  return [
    `Empresa: ${lead.company || "N/D"}`,
    `Nicho: ${lead.niche || "N/D"}`,
    `Cidade: ${lead.city || "N/D"}`,
    `Etapa atual/final: ${lead.stage || "N/D"}`,
    `Tipo de serviço: ${lead.serviceType || "N/D"}`,
    `Valor de contrato: ${lead.contractValue ? `R$ ${lead.contractValue}` : "N/D"}`,
    `ICP: ${lead.icpStars ?? "N/D"} estrelas`,
    `Temperatura: ${lead.temperature ?? "N/D"}`,
    `Roda ADS: ${lead.runsAds ? "Sim" : "Não"}`,
    `Ligações realizadas: ${callsCount}`,
    `Reuniões realizadas: ${meetingsCount}`,
    `Mensagens/E-mails: ${wpCount}`,
    `Duração da negociação (dias): ${durationDays}`,
    objecoes.length ? `Objeções mencionadas: ${objecoes.join(" | ")}` : `Objeções mencionadas: (não capturadas)`,
    argumentos.length ? `Argumentos utilizados: ${argumentos.join(" | ")}` : `Argumentos utilizados: (não capturados)`,
    `Observações do vendedor:\n${(lead.notes || "").slice(0, 800)}`,
    `Últimas ligações:\n${notes || "(sem ligações)"}`,
    `Últimas interações:\n${inters || "(sem interações)"}`,
  ].join("\n");
}

function buildMemoryMetadata(lead: Lead, extra?: Record<string, unknown>) {
  const callsCount = lead.callNotes?.length ?? 0;
  const { meetingsCount, wpCount, objecoes, argumentos } = extractSignalsFromInteractions(lead);
  const durationDays = daysBetween(lead.createdAt, new Date().toISOString());
  return {
    niche: lead.niche || null,
    city: lead.city || null,
    serviceType: lead.serviceType || null,
    stage: lead.stage || null,
    contractValue: lead.contractValue || null,
    icpStars: lead.icpStars ?? null,
    runsAds: !!lead.runsAds,
    // Métricas quantitativas usadas pelo motor de padrões:
    calls_count: callsCount,
    meetings_count: meetingsCount,
    messages_count: wpCount,
    duration_days: durationDays,
    // Sinais qualitativos:
    objecoes,
    argumentos,
    // Origem/campanha (se disponível em metadata do lead inbound):
    source: (lead as unknown as { source?: string }).source ?? null,
    campaign: (lead as unknown as { campaign?: string }).campaign ?? null,
    ...(extra || {}),
  };
}

/** Fire-and-forget: extrai memória a partir de um Lead. */
export function extractMemoryFromLead(kind: MemoryKind, lead: Lead, extraContext?: string) {
  const context = extraContext ? `${leadContextText(lead)}\n\n${extraContext}` : leadContextText(lead);
  const metadata = buildMemoryMetadata(lead);
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
