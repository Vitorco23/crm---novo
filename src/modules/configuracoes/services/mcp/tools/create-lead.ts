import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKey, requireAuth, saveKey, text } from "@/modules/configuracoes/services/mcp/_helpers";

type Lead = {
  id: string;
  company: string;
  contact: string;
  phone: string;
  niche: string;
  city: string;
  gmnLink: string;
  instagramLink: string;
  icpStars: number;
  runsAds: boolean;
  stage: string;
  createdAt: string;
  stageChangedAt: string;
  notes: string;
  attachments: unknown[];
  contractValue?: number;
  serviceType?: string;
};

const STAGE_DEFAULTS: Record<string, string> = {
  cold_call: "Não Contatado",
  oportunidades: "Reunião Marcada",
  onboarding: "Contrato Assinado",
};

export default defineTool({
  name: "create_lead",
  title: "Criar lead",
  description:
    "Cria um novo lead. Se 'stage' não for informado, entra na primeira etapa do pipeline escolhido (default: cold_call).",
  inputSchema: {
    company: z.string().min(1).describe("Nome da empresa."),
    contact: z.string().optional().describe("Nome do contato/decisor."),
    phone: z.string().optional(),
    niche: z.string().optional(),
    city: z.string().optional(),
    pipeline: z.enum(["cold_call", "oportunidades", "onboarding"]).optional(),
    stage: z.string().optional().describe("Nome da etapa (sobrescreve o default do pipeline)."),
    icpStars: z.number().int().min(1).max(3).optional(),
    contractValue: z.number().optional(),
    serviceType: z.string().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const pipeline = input.pipeline ?? "cold_call";
    const now = new Date().toISOString();
    const stage = input.stage ?? STAGE_DEFAULTS[pipeline];
    const lead: Lead = {
      id: crypto.randomUUID(),
      company: input.company,
      contact: input.contact ?? "",
      phone: input.phone ?? "",
      niche: input.niche ?? "",
      city: input.city ?? "",
      gmnLink: "",
      instagramLink: "",
      icpStars: input.icpStars ?? 2,
      runsAds: false,
      stage,
      createdAt: now,
      stageChangedAt: now,
      notes: input.notes ?? "",
      attachments: [],
      contractValue: input.contractValue,
      serviceType: input.serviceType,
    };
    const leads = await loadKey<Lead[]>(ctx, "p21_leads", []);
    await saveKey(ctx, "p21_leads", [lead, ...leads]);
    return text(
      { ok: true, lead, message: `Lead "${lead.company}" criado em ${stage}. Recarregue o CRM para ver.` },
      { id: lead.id, stage },
    );
  },
});
