// Diagnóstico Comercial Automático (V1.1)
// Chamado pelo consumidor Matteline após anexar uma nova Interaction. Envia
// contexto enxuto para a edge function `auto-diagnose-lead` (Gemini leve),
// grava o resultado no lead e — se houver `updated_memory` — acrescenta
// (nunca sobrescreve) às observações permanentes.

import { supabase } from "@/integrations/supabase/client";
import {
  type Lead,
  type AutoDiagnosis,
  type Interaction,
  computeDiagnosisInputHash,
  setLeadAutoDiagnosis,
  updateLead,
  getLeads,
  setAttachmentAnalysis,
} from "@/shared/services/store";
import { analyzeAttachment } from "./IntelMutations";

/** Máximo de anexos lidos por execução de "Atualizar Inteligência" (controle de custo). */
const MAX_ATTACHMENTS_PER_RUN = 4;

/**
 * Lê com IA os anexos ainda não analisados do lead (imagens, PDFs, documentos).
 * Executado sob demanda — apenas dentro do fluxo "Atualizar Inteligência".
 * Áudios são ignorados (as gravações já chegam resumidas pelo VoIP).
 */
export async function analyzePendingAttachments(leadId: string): Promise<number> {
  const lead = getLeads().find((l) => l.id === leadId);
  if (!lead) return 0;

  const pending = (lead.attachments || [])
    .filter((a) => !a.type?.startsWith("audio/") && !(a.aiAnalysis || "").trim())
    .slice(-MAX_ATTACHMENTS_PER_RUN);
  if (!pending.length) return 0;

  const leadContext = [
    lead.contact && `Contato: ${lead.contact}`,
    lead.company && `Empresa: ${lead.company}`,
    lead.niche && `Nicho: ${lead.niche}`,
    lead.city && `Cidade: ${lead.city}`,
    lead.stage && `Etapa: ${lead.stage}`,
  ].filter(Boolean).join("\n");

  let done = 0;
  for (const att of pending) {
    try {
      const { content } = await analyzeAttachment({
        attachment: { name: att.name, type: att.type, dataUrl: att.dataUrl },
        leadContext,
      });
      if (content.trim()) {
        setAttachmentAnalysis(leadId, att.id, content);
        done++;
      }
    } catch (e) {
      console.warn("[autoDiagnosis] attachment read failed", (e as Error)?.message);
    }
  }
  return done;
}

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

  // Fallback: leads sem interações formais mas com ligações registradas
  // (callNotes) continuam elegíveis — o diagnóstico usa a ligação mais recente.
  const latestNote = [...(lead.callNotes || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  if (!latest && !latestNote && !(lead.notes || "").trim()) return null;

  // Extrai resumo/transcrição da ligação mais recente (fonte Matteline).
  const summary = latest?.summary || latestNote?.text || "";
  // A transcrição bruta não é armazenada no Lead — a UI mostra apenas o resumo.
  // Enviamos o `sellerNotes` como contexto adicional (áudio, link, duração).
  const meta = latest?.sellerNotes || "";

  const recentInteractions = interactions.slice(0, 6).map((i) => ({
    date: i.date,
    title: i.title,
    summary: i.summary || "",
  }));

  // Leituras de anexos já feitas pela IA (prints de WhatsApp, PDFs, documentos).
  // Entram como contexto textual — o arquivo bruto nunca é reenviado aqui.
  const attachmentInsights = (lead.attachments || [])
    .filter((a) => (a.aiAnalysis || "").trim())
    .slice(-5)
    .map((a) => `• ${a.name} (${a.type}):\n${String(a.aiAnalysis).slice(0, 2000)}`)
    .join("\n\n");

  const notesWithAttachments = [
    lead.notes || "",
    attachmentInsights ? `ANEXOS ANALISADOS PELA IA:\n${attachmentInsights}` : "",
  ].filter(Boolean).join("\n\n");


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
        notes: notesWithAttachments,

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
