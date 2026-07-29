import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKey, requireAuth, text } from "@/modules/configuracoes/services/mcp/_helpers";

type Lead = {
  id: string;
  company: string;
  contact: string;
  phone: string;
  niche: string;
  city: string;
  stage: string;
  icpStars: number;
  contractValue?: number;
  serviceType?: string;
  createdAt: string;
  stageChangedAt: string;
};

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads do usuário. Suporta filtros por etapa (stage), cidade, nicho, texto livre em empresa/contato e limite. Use para responder perguntas do tipo 'quantos leads na etapa X' ou 'leads da cidade Y'.",
  inputSchema: {
    stage: z.string().optional().describe("Nome exato da etapa (ex.: 'Reunião Marcada', 'Ganho')."),
    city: z.string().optional(),
    niche: z.string().optional(),
    search: z.string().optional().describe("Texto livre buscando em empresa, contato ou telefone."),
    limit: z.number().int().min(1).max(500).optional().describe("Máximo de leads a retornar (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const leads = await loadKey<Lead[]>(ctx, "p21_leads", []);
    const limit = input.limit ?? 50;
    const q = (input.search ?? "").trim().toLowerCase();
    const filtered = leads.filter((l) => {
      if (input.stage && l.stage !== input.stage) return false;
      if (input.city && (l.city ?? "").toLowerCase() !== input.city.toLowerCase()) return false;
      if (input.niche && (l.niche ?? "").toLowerCase() !== input.niche.toLowerCase()) return false;
      if (q) {
        const hay = `${l.company} ${l.contact} ${l.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const items = filtered.slice(0, limit).map((l) => ({
      id: l.id,
      company: l.company,
      contact: l.contact,
      phone: l.phone,
      niche: l.niche,
      city: l.city,
      stage: l.stage,
      icpStars: l.icpStars,
      contractValue: l.contractValue,
      serviceType: l.serviceType,
      createdAt: l.createdAt,
      stageChangedAt: l.stageChangedAt,
    }));
    return text(
      { total: filtered.length, returned: items.length, leads: items },
      { total: filtered.length, returned: items.length },
    );
  },
});
