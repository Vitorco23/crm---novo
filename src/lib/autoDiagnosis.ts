// Diagnóstico Comercial Automático (V1.1)
// Chamado pelo consumidor Matteline após anexar uma nova Interaction. Envia
// contexto enxuto para a edge function `auto-diagnose-lead` (Gemini leve),
// grava o resultado no lead e — se houver `updated_memory` — acrescenta
// (nunca sobrescreve) às observações permanentes.

import { supabase } from "@/integrations/supabase/client";
import {
  type Lead,
  type AutoDiagnosis,
  computeDiagnosisInputHash,
  setLeadAutoDiagnosis,
  updateLead,
  getLeads,
} from "@/lib/store";

const MEMORY_HEADER = "IA Comercial";

/** Verifica se a memória já foi registrada (case-insensitive, texto simples). */
function memoryAlreadyPresent(notes: string, memory: string): boolean {
  if (!notes || !memory) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(notes).includes(norm(memory));
}

/** Formata "IA Comercial • DD/MM HH:mm — <memória>" e concatena. */
function appendMemoryToNotes(currentNotes: string, memory: string): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const header = `${MEMORY_HEADER} • ${dd}/${mm} ${hh}:${mi}`;
  const block = `\n\n${header}\n${memory.trim()}`;
  return (currentNotes || "").trimEnd() + block;
}

export async function runAutoDiagnosis(leadId: string): Promise<AutoDiagnosis | null> {
  const lead = getLeads().find((l) => l.id === leadId);
  if (!lead) return null;

  const interactions = [...(lead.interactions || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const latest = interactions[0];
  if (!latest) return null;

  // Extrai resumo/transcrição da ligação mais recente (fonte Matteline).
  const summary = latest.summary || "";
  // A transcrição bruta não é armazenada no Lead — a UI mostra apenas o resumo.
  // Enviamos o `sellerNotes` como contexto adicional (áudio, link, duração).
  const meta = latest.sellerNotes || "";

  const recentInteractions = interactions.slice(0, 6).map((i) => ({
    date: i.date,
    title: i.title,
    summary: i.summary || "",
  }));

  try {
    const { data, error } = await supabase.functions.invoke("auto-diagnose-lead", {
      body: {
        leadId: lead.id,
        company: lead.company,
        niche: lead.niche,
        city: lead.city,
        stage: lead.stage,
        summary: [summary, meta].filter(Boolean).join("\n\n"),
        transcription: "",
        notes: lead.notes || "",
        recentInteractions,
      },
    });
    if (error) throw error;
    if (!data?.ok || !data.data) throw new Error(data?.error || "Sem resposta");

    const diagnosis: AutoDiagnosis = {
      ...data.data,
      generatedAt: data.generatedAt || new Date().toISOString(),
      model: data.model,
      inputHash: computeDiagnosisInputHash(lead),
    };
    setLeadAutoDiagnosis(lead.id, diagnosis);

    // Memória permanente — apenas se realmente for aprendizado novo.
    const mem = (diagnosis.updated_memory || "").trim();
    if (mem && !memoryAlreadyPresent(lead.notes || "", mem)) {
      updateLead(lead.id, { notes: appendMemoryToNotes(lead.notes || "", mem) });
    }

    // Notifica a UI (o drawer já escuta este evento).
    try {
      window.dispatchEvent(new CustomEvent("p21:leads-changed", { detail: { source: "auto-diagnosis", leadId } }));
    } catch { /* ignore */ }

    return diagnosis;
  } catch (e) {
    console.warn("[autoDiagnosis] failed", (e as Error)?.message);
    return null;
  }
}

/** Dispara diagnósticos em série (evita concorrência de tokens) para um conjunto de leads. */
export async function runAutoDiagnosisForLeads(leadIds: string[]): Promise<void> {
  const uniq = Array.from(new Set(leadIds));
  for (const id of uniq) {
    try { await runAutoDiagnosis(id); } catch { /* ignore */ }
  }
}
