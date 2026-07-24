import { supabase } from "@/integrations/supabase/client";
import { setCallNoteAnalysis, getMovementEvents, type CallNoteAnalysis, type Lead, type CallNote } from "@/lib/store";
import { getTasksByLead } from "@/lib/leadTasks";
import { getHistoryForLead } from "@/lib/history";

function fmt(dt: string) {
  try { return new Date(dt).toLocaleString("pt-BR"); } catch { return dt; }
}

export async function analyzeCallNote(lead: Lead, note: CallNote): Promise<CallNoteAnalysis> {
  const notes = [...(lead.callNotes || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const idx = notes.findIndex((n) => n.id === note.id);
  const attempt = idx >= 0 ? idx + 1 : notes.length;

  // Histórico COMPLETO de ligações (não apenas anteriores)
  const allCallNotes = notes
    .map((n, i) => {
      const marker = n.id === note.id ? "  <-- LIGAÇÃO EM ANÁLISE" : "";
      return `#${i + 1} [${fmt(n.createdAt)}] ${n.scriptUsed ? `(script: ${n.scriptUsed}) ` : ""}${n.text}${marker}`;
    })
    .join("\n")
    .slice(0, 8000);

  // Tarefas do lead
  const tasks = getTasksByLead(lead.id);
  const tarefasConcluidas = tasks
    .filter((t) => t.status === "concluida")
    .map((t) => `- [${fmt(t.completedAt || t.dueAt)}] ${t.title}${t.description ? ` — ${t.description}` : ""}`)
    .join("\n")
    .slice(0, 2000) || "(nenhuma)";
  const tarefasPendentes = tasks
    .filter((t) => t.status === "pendente")
    .map((t) => `- [prazo ${fmt(t.dueAt)}] (${t.priority}) ${t.title}${t.description ? ` — ${t.description}` : ""}`)
    .join("\n")
    .slice(0, 2000) || "(nenhuma)";

  // Movimentações de pipeline
  const movs = getMovementEvents()
    .filter((m) => m.leadId === lead.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((m) => `- [${fmt(m.timestamp)}] → ${m.toStage} (${m.type})`)
    .join("\n")
    .slice(0, 2000) || "(sem movimentações registradas)";

  // Histórico geral (eventos)
  const history = getHistoryForLead(lead.id)
    .slice(0, 30)
    .map((h) => `- [${fmt(h.at)}] ${h.label}${h.detail ? ` — ${h.detail}` : ""}`)
    .join("\n")
    .slice(0, 2000) || "(sem eventos)";

  const leadInfo = [
    `Empresa: ${lead.company || "N/D"}`,
    `Contato: ${lead.contact || "N/D"}`,
    `Nicho: ${lead.niche || "N/D"}`,
    `Cidade: ${lead.city || "N/D"}`,
    `Etapa atual: ${lead.stage || "N/D"}`,
    `ICP (estrelas): ${lead.icpStars ?? "N/D"}`,
    `Faz anúncios: ${lead.runsAds ? "Sim" : "Não"}`,
    `Temperatura atual: ${lead.temperature || "N/D"}`,
    `Tipo de serviço: ${lead.serviceType || "N/D"}`,
    `Valor de contrato: ${lead.contractValue ? `R$ ${lead.contractValue}` : "N/D"}`,
    `Criado em: ${fmt(lead.createdAt)}`,
    `Última mudança de etapa: ${fmt(lead.stageChangedAt)}`,
    `Total de ligações registradas: ${notes.length}`,
    `Tentativa atual (índice da ligação em análise): ${attempt}`,
    `Observações cadastrais:\n${(lead.notes || "(vazio)").slice(0, 1500)}`,
  ].join("\n");

  const { data, error } = await supabase.functions.invoke("analyze-call-note", {
    body: {
      leadId: lead.id,
      noteId: note.id,
      company: lead.company,
      niche: lead.niche,
      stage: lead.stage,
      attempt,
      callSummary: note.text,
      leadInfo,
      allCallNotes,
      tarefasConcluidas,
      tarefasPendentes,
      movimentacoes: movs,
      historicoEventos: history,
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
