import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, loadKey, requireAuth, saveKey, text } from "../_helpers";

type CallNote = { id: string; timestamp: string; text: string; outcome?: string };
type Lead = { id: string; company: string; callNotes?: CallNote[]; notes?: string };

export default defineTool({
  name: "log_call_note",
  title: "Registrar nota de ligação",
  description:
    "Adiciona uma nota de ligação ao histórico do lead. Use para logar retornos rápidos ('deixei recado', 'reagendou', 'sem interesse').",
  inputSchema: {
    leadId: z.string().min(1),
    text: z.string().min(1).describe("Conteúdo da nota."),
    outcome: z
      .enum(["conectou", "sem_resposta", "recado", "reagendou", "sem_interesse", "reuniao_marcada", "outro"])
      .optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const leads = await loadKey<Lead[]>(ctx, "p21_leads", []);
    const idx = leads.findIndex((l) => l.id === input.leadId);
    if (idx === -1) return errorResult(`Lead ${input.leadId} não encontrado.`);
    const note: CallNote = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      text: input.text,
      outcome: input.outcome,
    };
    const updated: Lead = { ...leads[idx], callNotes: [note, ...(leads[idx].callNotes ?? [])] };
    const next = [...leads];
    next[idx] = updated;
    await saveKey(ctx, "p21_leads", next);
    return text({ ok: true, leadId: input.leadId, company: updated.company, note }, { id: note.id });
  },
});
