import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, loadKey, requireAuth, text } from "../_helpers";

type Lead = Record<string, unknown> & { id: string };

export default defineTool({
  name: "get_lead",
  title: "Detalhes do lead",
  description: "Retorna todos os dados de um lead pelo ID, incluindo notas e anexos.",
  inputSchema: {
    id: z.string().min(1).describe("ID do lead."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    requireAuth(ctx);
    const leads = await loadKey<Lead[]>(ctx, "p21_leads", []);
    const found = leads.find((l) => l.id === id);
    if (!found) return errorResult(`Lead ${id} não encontrado.`);
    return text(found, { id });
  },
});
