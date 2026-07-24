import { supabase } from "@/integrations/supabase/client";
import { setCallNoteAnalysis, type CallNoteAnalysis, type Lead, type CallNote } from "@/lib/store";

export async function analyzeCallNote(lead: Lead, note: CallNote): Promise<CallNoteAnalysis> {
  const notes = [...(lead.callNotes || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const idx = notes.findIndex((n) => n.id === note.id);
  const attempt = idx >= 0 ? idx + 1 : notes.length;
  const priorNotes = idx > 0 ? notes.slice(0, idx) : [];
  const leadHistory = priorNotes
    .slice(-8)
    .map((n) => {
      const d = new Date(n.createdAt).toLocaleString("pt-BR");
      return `[${d}] ${n.text}`;
    })
    .join("\n")
    .slice(0, 4000);

  const { data, error } = await supabase.functions.invoke("analyze-call-note", {
    body: {
      leadId: lead.id,
      noteId: note.id,
      company: lead.company,
      niche: lead.niche,
      stage: lead.stage,
      attempt,
      callSummary: note.text,
      leadHistory,
    },
  });

  if (error) {
    const details = "context" in error && error.context ? await (error.context as Response).text().catch(() => "") : "";
    throw new Error(details || error.message || "Falha ao analisar ligação");
  }
  const analysis = data as CallNoteAnalysis;
  setCallNoteAnalysis(lead.id, note.id, analysis);
  return analysis;
}
