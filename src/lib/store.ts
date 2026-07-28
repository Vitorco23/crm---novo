// ===== Pipeline Definitions (defaults; user can edit/persist) =====
export const DEFAULT_COLD_CALL_STAGES = [
  "Novo Lead",
  "Tentativa 1",
  "Tentativa 2",
  "Tentativa 3",
  "Tentativa 4",
  "Tentativa 5",
  "Tentativa 6",
  "Tentativa 7",
  "Tentativa 8",
  "Tentativa 9",
  "Tentativa 10",
  "Não Quer",
  "Sem contato",
] as const;

export const DEFAULT_OPORTUNIDADES_STAGES = [
  "Reunião Marcada",
  "Reunião Realizada",
  "No Show",
  "Documento de Guerra",
  "Proposta Enviada",
  "Ganho",
  "Perdido",
] as const;


export const DEFAULT_ONBOARDING_STAGES = [
  "Assinatura do Contrato",
  "Pagamento",
  "Reunião de Integração",
  "Concepção do Planejamento",
  "Apresentação do Planejamento",
  "Sprints",
] as const;

// Legacy compatibility (some files still import these names)
export const COLD_CALL_STAGES = DEFAULT_COLD_CALL_STAGES;
export const OPORTUNIDADES_STAGES = DEFAULT_OPORTUNIDADES_STAGES;
export const ONBOARDING_STAGES = DEFAULT_ONBOARDING_STAGES;

export type PipelineStage = string;
export type PipelineName = "cold_call" | "oportunidades" | "onboarding";

export type ICPStars = 1 | 2 | 3;

export interface LeadAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
}

export interface CallAuditFollowupStep {
  quando: string;
  acao: string;
}

export interface CallAuditData {
  temperatura: "Quente" | "Morno" | "Frio";
  tendencia?: "Evoluindo" | "Esfriando" | "Estavel";
  tendenciaJustificativa?: string;
  scoreComercial: number;
  probabilidadeAvanco: "Baixa" | "Media" | "Alta";
  prioridade: "Baixa" | "Media" | "Alta";
  resumoExecutivo: string;
  evolucaoLead?: string;
  objecoes: string[];
  pontosPositivos: string[];
  pontosAtencao: string[];
  oportunidadeComercial: string[];
  feedbackVendedor: string;
  planoFollowup: CallAuditFollowupStep[];
  recomendacaoEstrategica: string;
  principalObjecao: string;
  proximaAcao: string;
  diasAteProximoFollowup: number;
  dataProximoContato: string;
  assuntosDeInteresse: string[];
  /** Próxima Melhor Ação (NBA) — anexada pela IA + guard-rails determinísticos. */
  nextBestAction?: import("./nextBestAction").NextBestAction;
}

export interface CallNoteAnalysis {
  markdown?: string;
  data?: CallAuditData;
  temperature: "Quente" | "Morno" | "Frio";
  generatedAt: string;
  model: string;
  mode?: "quick" | "full";
}

export interface CallNote {
  id: string;
  text: string;
  createdAt: string;
  scriptUsed?: string;
  analysis?: CallNoteAnalysis;
}


// ===== Interações Comerciais (timeline unificada) =====
// Tipo aberto (string) para permitir novos tipos sem alterar schema.
export type InteractionType =
  | "Ligação"
  | "Reunião Comercial"
  | "Reunião de Diagnóstico"
  | "Reunião de Apresentação"
  | "Follow-up"
  | "WhatsApp"
  | "E-mail"
  | "Envio de Proposta"
  | "Visita Presencial"
  | "Outro"
  | string;

export interface Interaction {
  id: string;
  type: InteractionType;
  date: string;          // ISO da data da interação
  title: string;         // ex: "Primeira Ligação", "Reunião de Diagnóstico"
  summary: string;       // resumo (Matteline / IA / manual) — principal fonte para IA
  sellerNotes?: string;  // anotações extras do vendedor (contexto que não está no resumo)
  createdAt: string;     // ISO de quando foi registrada
}

export interface Lead {
  id: string;
  company: string;
  contact: string;
  phone: string;
  /**
   * Formato oficial para integrações/deduplicação: 55 + DDD + número (só dígitos).
   * NUNCA é exibido para o usuário — sempre derivado de `phone` (ou `whatsapp`)
   * automaticamente por `saveLeads()` / `getLeads()`.
   */
  phoneNormalized?: string;
  niche: string;
  city: string;
  gmnLink: string;
  instagramLink: string;
  icpStars: ICPStars;
  runsAds: boolean;
  stage: PipelineStage;
  createdAt: string;
  stageChangedAt: string;
  notes: string;
  attachments: LeadAttachment[];
  callNotes?: CallNote[];
  interactions?: Interaction[];
  contractValue?: number;
  serviceType?: string;
  phoneInvalid?: boolean;
  temperature?: "Quente" | "Morno" | "Frio";
  website?: string;
  whatsapp?: string;
  /** Diagnóstico Comercial Automático (V1.1) — gerado após ligações Matteline. */
  autoDiagnosis?: AutoDiagnosis;
}

export interface AutoDiagnosis {
  temperature: "quente" | "morno" | "frio";
  probability: number;
  summary: string;
  next_action: string;
  attention: string;
  updated_memory: string;
  generatedAt: string;
  model?: string;
  /** Fingerprint das interações consideradas — usado para detectar "desatualizado". */
  inputHash: string;
}


export type MeetingSource = "Ligação" | "Disparo" | "Instagram" | "Email";

export interface Meeting {
  id: string;
  leadId: string;
  company: string;
  date: string; // ISO date
  time: string; // HH:mm
  title?: string; // e.g. "Reunião de Alinhamento: Empresa - P21"
  contactName?: string;
  channel?: "Google Meet" | "Zoom" | "Presencial" | "Telefone" | "Outro";
  source?: MeetingSource; // canal pelo qual a reunião veio
  link?: string;
  notes?: string;
  attendeeEmail?: string;
  googleEventId?: string;
  googleEventUrl?: string;
  meetLink?: string;
  createdAt: string;
}

export interface PomodoroSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
  niche?: string;
  scriptUsed?: string;
  // legacy
  messages?: number;
}

export interface MovementEvent {
  id: string;
  leadId: string;
  toStage: PipelineStage;
  timestamp: string;
  type: "call" | "message" | "meeting" | "other";
}

// ===== Storage helpers (user-scoped) =====
import { uload as loadFromStorage, usave as saveToStorage, normalizePhoneBR } from "./userStorage";
import { emit } from "./eventBus";

function classifyStage(stage: string): "call" | "message" | "meeting" | "sale" | "onboarding" | "other" {
  const s = stage.toLowerCase();
  if (s === "ganho") return "sale";
  if (MEETING_STAGE_HINTS.some((h) => s.includes(h))) return "meeting";
  if (MESSAGE_STAGE_HINTS.some((h) => s.includes(h))) return "message";
  if (CALL_STAGE_HINTS.some((h) => s.includes(h))) return "call";
  return "other";
}

// ===== Custom stages persistence =====
const STAGES_KEYS: Record<PipelineName, string> = {
  cold_call: "p21_stages_cold_call",
  oportunidades: "p21_stages_oportunidades",
  onboarding: "p21_stages_onboarding",
};

export function getStagesForPipeline(pipeline: PipelineName): PipelineStage[] {
  const fallback =
    pipeline === "cold_call"
      ? [...DEFAULT_COLD_CALL_STAGES]
      : pipeline === "oportunidades"
      ? [...DEFAULT_OPORTUNIDADES_STAGES]
      : [...DEFAULT_ONBOARDING_STAGES];
  const stored = loadFromStorage<string[] | null>(STAGES_KEYS[pipeline], null);
  const source = stored && stored.length ? stored : fallback;
  // Defesa: remove duplicados (case-insensitive) preservando a ordem.
  const seen = new Set<string>();
  const deduped = source.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Cold Call é canônico: se a lista diferir do default (ex: "Mensagem WhatsApp"
  // legado, sem Tentativa 9/10, sem "Não Quer"/"Sem contato"), migra automaticamente
  // e reatribui leads em etapas removidas para "Novo Lead".
  if (pipeline === "cold_call") {
    const canonical = [...DEFAULT_COLD_CALL_STAGES];
    const same =
      deduped.length === canonical.length &&
      deduped.every((s, i) => s === canonical[i]);
    if (!same) {
      saveStagesForPipeline("cold_call", canonical);
      const valid = new Set<string>(canonical);
      // reatribui leads apenas se estavam em etapa cold_call antiga
      const oldSet = new Set(deduped);
      const leads = loadFromStorage<Lead[]>("p21_leads", []);
      let changed = false;
      const next = leads.map((l) => {
        if (oldSet.has(l.stage) && !valid.has(l.stage)) {
          changed = true;
          return { ...l, stage: "Novo Lead", stageChangedAt: new Date().toISOString() };
        }
        return l;
      });
      if (changed) saveToStorage("p21_leads", next);
      return canonical;
    }
  }
  return deduped;
}

export function saveStagesForPipeline(pipeline: PipelineName, stages: PipelineStage[]) {
  saveToStorage(STAGES_KEYS[pipeline], stages);
}

export function renameStage(
  pipeline: PipelineName,
  oldName: string,
  newName: string,
): { ok: boolean; error?: string } {
  const trimmed = (newName || "").trim();
  if (!trimmed) return { ok: false, error: "Nome inválido" };
  if (trimmed === oldName) return { ok: true };
  const stages = getStagesForPipeline(pipeline);
  if (!stages.includes(oldName)) return { ok: false, error: "Etapa não encontrada" };
  if (stages.some((s) => s !== oldName && s.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "Já existe uma etapa com esse nome" };
  }
  const next = stages.map((s) => (s === oldName ? trimmed : s));
  saveStagesForPipeline(pipeline, next);
  const leads = getLeads().map((l) => (l.stage === oldName ? { ...l, stage: trimmed } : l));
  saveLeads(leads);
  return { ok: true };
}

export function addStage(pipeline: PipelineName, name: string): { ok: boolean; error?: string } {
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "Nome inválido" };
  const stages = getStagesForPipeline(pipeline);
  if (stages.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "Já existe uma etapa com esse nome" };
  }
  saveStagesForPipeline(pipeline, [...stages, trimmed]);
  return { ok: true };
}


export function removeStage(pipeline: PipelineName, name: string) {
  const stages = getStagesForPipeline(pipeline);
  if (stages.length <= 1) return;
  const next = stages.filter((s) => s !== name);
  saveStagesForPipeline(pipeline, next);
  // move leads from removed stage to first remaining stage
  const fallback = next[0];
  const leads = getLeads().map((l) => (l.stage === name ? { ...l, stage: fallback } : l));
  saveLeads(leads);
}

export function reorderStages(pipeline: PipelineName, stages: PipelineStage[]) {
  saveStagesForPipeline(pipeline, stages);
}

// ===== Pipeline routing =====
export function getPipelineForStage(stage: PipelineStage): PipelineName {
  if (getStagesForPipeline("cold_call").includes(stage)) return "cold_call";
  if (getStagesForPipeline("onboarding").includes(stage)) return "onboarding";
  return "oportunidades";
}

export function getLeadsForPipeline(pipeline: PipelineName): Lead[] {
  const stages = getStagesForPipeline(pipeline);
  return getLeads().filter((l) => stages.includes(l.stage));
}

// ===== Leads =====
/**
 * Garante que todo Lead tenha `phoneNormalized` (55+DDD+número) derivado
 * de `phone` (ou, na ausência, `whatsapp`). É idempotente: se `phone` mudou
 * ou está vazio, recomputa; se já bate, mantém.
 */
function ensurePhoneNormalized(l: Lead): Lead {
  const expected = normalizePhoneBR(l.phone || l.whatsapp);
  if (l.phoneNormalized === expected) return l;
  return { ...l, phoneNormalized: expected };
}

export function getLeads(): Lead[] {
  const leads = loadFromStorage<Lead[]>("p21_leads", []);
  let migrationNeeded = false;
  const mapped = leads.map((l) => {
    const base: Lead = {
      ...l,
      icpStars: l.icpStars || ((l as any).icpProfile === "Não Fit" ? 1 : 3),
      attachments: l.attachments || [],
      callNotes: l.callNotes || [],
      interactions: l.interactions || [],
    };
    const expected = normalizePhoneBR(base.phone || base.whatsapp);
    if (base.phoneNormalized !== expected) {
      migrationNeeded = true;
      base.phoneNormalized = expected;
    }
    return base;
  });
  // Migração única e transparente: se algum Lead ainda não tinha o campo
  // (ou o valor estava desatualizado após edição de `phone`), grava de volta.
  if (migrationNeeded) {
    try {
      // Persistência assíncrona para não bloquear leitura.
      queueMicrotask(() => saveToStorage("p21_leads", mapped));
    } catch {
      saveToStorage("p21_leads", mapped);
    }
  }
  return mapped;
}

export function saveLeads(leads: Lead[]) {
  // Sempre normaliza no ponto de escrita — fonte oficial de verdade.
  const normalized = leads.map(ensurePhoneNormalized);
  saveToStorage("p21_leads", normalized);
}

// ===== Duplicate detection =====
const normalizeText = (s: string) => (s || "").trim().toLowerCase();
const normalizeUrl = (s: string) => {
  const v = (s || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return v;
};

export interface LeadDupKeys {
  phone: string;
  company: string;
  gmn: string;
}

export function leadDupKeys(
  lead: Pick<Lead, "phone" | "company" | "gmnLink"> & { phoneNormalized?: string; whatsapp?: string }
): LeadDupKeys {
  return {
    // Deduplicação SEMPRE via phoneNormalized (55+DDD+número). Se o objeto
    // ainda não tem, calcula on-the-fly — nunca compara telefone formatado.
    phone: lead.phoneNormalized || normalizePhoneBR(lead.phone || lead.whatsapp),
    company: normalizeText(lead.company),
    gmn: normalizeUrl(lead.gmnLink),
  };
}

export function isDuplicateLead(
  candidate: Pick<Lead, "phone" | "company" | "gmnLink">,
  existing: Pick<Lead, "phone" | "company" | "gmnLink">[]
): boolean {
  const k = leadDupKeys(candidate);
  return existing.some((e) => {
    const ek = leadDupKeys(e);
    return (
      (k.phone && ek.phone && k.phone === ek.phone) ||
      (k.company && ek.company && k.company === ek.company) ||
      (k.gmn && ek.gmn && k.gmn === ek.gmn)
    );
  });
}

/** Removes duplicates keeping the oldest (first by createdAt). Returns count removed. O(n). */
export function dedupeLeads(): number {
  const leads = getLeads().slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const phones = new Set<string>();
  const companies = new Set<string>();
  const gmns = new Set<string>();
  const kept: Lead[] = [];
  let removed = 0;
  for (const l of leads) {
    const k = leadDupKeys(l);
    const dup =
      (k.phone && phones.has(k.phone)) ||
      (k.company && companies.has(k.company)) ||
      (k.gmn && gmns.has(k.gmn));
    if (dup) {
      removed++;
    } else {
      if (k.phone) phones.add(k.phone);
      if (k.company) companies.add(k.company);
      if (k.gmn) gmns.add(k.gmn);
      kept.push(l);
    }
  }
  if (removed > 0) saveLeads(kept);
  return removed;
}

export function addLead(
  lead: Omit<Lead, "id" | "createdAt" | "stageChangedAt" | "stage" | "attachments">,
  initialStage: PipelineStage = "Novo Lead"
): Lead {
  const leads = getLeads();
  const newLead: Lead = {
    ...lead,
    id: crypto.randomUUID(),
    stage: initialStage,
    createdAt: new Date().toISOString(),
    stageChangedAt: new Date().toISOString(),
    attachments: [],
  };
  leads.push(newLead);
  saveLeads(leads);
  emit("LeadCriado", { leadId: newLead.id, company: newLead.company, stage: newLead.stage });
  return newLead;
}

export function updateLead(id: string, updates: Partial<Lead>) {
  const leads = getLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx !== -1) {
    leads[idx] = { ...leads[idx], ...updates };
    saveLeads(leads);
  }
}

export function updateLeadStage(id: string, stage: PipelineStage) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === id);
  if (lead) {
    lead.stage = stage;
    lead.stageChangedAt = new Date().toISOString();
    saveLeads(leads);
  }
}

export function deleteLead(id: string) {
  const leads = getLeads().filter((l) => l.id !== id);
  saveLeads(leads);
}

// ===== Batch APIs (1 read + 1 write for N leads) =====

export function addLeadsBatch(
  newLeads: Omit<Lead, "id" | "createdAt" | "stageChangedAt" | "stage" | "attachments">[],
  initialStage: PipelineStage = "Novo Lead"
): Lead[] {
  const leads = getLeads();
  const now = new Date().toISOString();
  const created: Lead[] = newLeads.map((l) => ({
    ...l,
    id: crypto.randomUUID(),
    stage: initialStage,
    createdAt: now,
    stageChangedAt: now,
    attachments: [],
  }));
  saveLeads([...leads, ...created]);
  return created;
}

export function updateLeadsBatch(ids: Set<string> | string[], updates: Partial<Lead>) {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  if (idSet.size === 0) return;
  const leads = getLeads().map((l) => (idSet.has(l.id) ? { ...l, ...updates } : l));
  saveLeads(leads);
}

export function deleteLeadsBatch(ids: Set<string> | string[]) {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  if (idSet.size === 0) return;
  const leads = getLeads().filter((l) => !idSet.has(l.id));
  saveLeads(leads);
}

/** Move N leads to the same stage in a single read+write. */
export function moveLeadsToStageBatch(
  ids: Set<string> | string[],
  toStage: PipelineStage
): { autoTransfer?: PipelineName; movedCount: number } {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  if (idSet.size === 0) return { movedCount: 0 };

  let effectiveStage = toStage;
  if (toStage === "Ganho") {
    const onb = getStagesForPipeline("onboarding");
    if (onb.length > 0) effectiveStage = onb[0];
  }
  const toPipeline = getPipelineForStage(effectiveStage);
  const now = new Date().toISOString();

  const leads = getLeads();
  const events = getMovementEvents();
  const lower = effectiveStage.toLowerCase();
  let type: MovementEvent["type"] = "other";
  if (CALL_STAGE_HINTS.some((h) => lower.includes(h))) type = "call";
  else if (MESSAGE_STAGE_HINTS.some((h) => lower.includes(h))) type = "message";
  else if (MEETING_STAGE_HINTS.some((h) => lower.includes(h))) type = "meeting";

  const onboardingTriggers: Lead[] = [];
  let autoTransfer: PipelineName | undefined;
  let movedCount = 0;
  const next = leads.map((l) => {
    if (!idSet.has(l.id)) return l;
    const fromPipeline = getPipelineForStage(l.stage);
    if (fromPipeline !== toPipeline) autoTransfer = toPipeline;
    if (toPipeline === "onboarding" && fromPipeline !== "onboarding" && (l.contractValue ?? 0) > 0) {
      onboardingTriggers.push(l);
    }
    movedCount++;
    events.push({
      id: crypto.randomUUID(),
      leadId: l.id,
      toStage: effectiveStage,
      timestamp: now,
      type,
    });
    return { ...l, stage: effectiveStage, stageChangedAt: now };
  });

  saveLeads(next);
  saveMovementEvents(events);

  // Emissão em lote: um evento por lead movido, com dedupeKey para evitar duplicatas.
  const affected = leads.filter((l) => idSet.has(l.id));
  const now2 = now;
  for (const l of affected) {
    emit(
      "LeadMovido",
      { leadId: l.id, company: l.company, fromStage: l.stage, toStage: effectiveStage },
      `move:${l.id}:${effectiveStage}:${now2}`
    );
    const kind = classifyStage(effectiveStage);
    if (kind === "call") emit("LigacaoRegistrada", { leadId: l.id, company: l.company, stage: effectiveStage });
    if (kind === "message") emit("MensagemRegistrada", { leadId: l.id, company: l.company, stage: effectiveStage });
  }

  if (onboardingTriggers.length > 0) {
    import("./finance").then(({ upsertOnboardingRevenue }) => {
      onboardingTriggers.forEach((l) => {
        upsertOnboardingRevenue({
          clientId: l.id,
          clientName: l.company,
          amount: l.contractValue!,
          serviceType: l.serviceType,
        });
        emit("OnboardingIniciado", { leadId: l.id, company: l.company }, `onb:${l.id}`);
      });
    });
  }

  return { autoTransfer, movedCount };
}

export function addAttachment(leadId: string, attachment: Omit<LeadAttachment, "id" | "createdAt">) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.attachments.push({
      ...attachment,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    saveLeads(leads);
  }
}

export function removeAttachment(leadId: string, attachmentId: string) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.attachments = lead.attachments.filter((a) => a.id !== attachmentId);
    saveLeads(leads);
  }
}

export function addCallNote(leadId: string, text: string, scriptUsed?: string) {
  if (!text.trim()) return;
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.callNotes = [
      ...(lead.callNotes || []),
      {
        id: crypto.randomUUID(),
        text: text.trim(),
        createdAt: new Date().toISOString(),
        ...(scriptUsed ? { scriptUsed } : {}),
      },
    ];
    saveLeads(leads);
    emit("LigacaoRegistrada", { leadId: lead.id, company: lead.company, stage: lead.stage, scriptUsed });
  }
}

export function setCallNoteAnalysis(leadId: string, noteId: string, analysis: CallNoteAnalysis) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.callNotes = (lead.callNotes || []).map((n) =>
    n.id === noteId ? { ...n, analysis } : n
  );
  saveLeads(leads);
}


export function removeCallNote(leadId: string, noteId: string) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.callNotes = (lead.callNotes || []).filter((n) => n.id !== noteId);
    saveLeads(leads);
  }
}

// ===== Interações Comerciais =====
export function getInteractions(lead: Lead): Interaction[] {
  return [...(lead.interactions || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function addInteraction(
  leadId: string,
  data: Omit<Interaction, "id" | "createdAt"> & { createdAt?: string }
) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  const interaction: Interaction = {
    id: crypto.randomUUID(),
    createdAt: data.createdAt ?? new Date().toISOString(),
    type: data.type,
    date: data.date,
    title: data.title.trim(),
    summary: data.summary.trim(),
    sellerNotes: data.sellerNotes?.trim() || undefined,
  };
  lead.interactions = [...(lead.interactions || []), interaction];
  saveLeads(leads);
  emit("LigacaoRegistrada", {
    leadId: lead.id, company: lead.company, stage: lead.stage,
    interactionType: interaction.type,
  });
}

export function updateInteraction(leadId: string, interactionId: string, patch: Partial<Omit<Interaction, "id" | "createdAt">>) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.interactions = (lead.interactions || []).map((i) =>
    i.id === interactionId ? {
      ...i,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : i.title,
      summary: patch.summary !== undefined ? patch.summary.trim() : i.summary,
      sellerNotes: patch.sellerNotes !== undefined ? (patch.sellerNotes?.trim() || undefined) : i.sellerNotes,
    } : i
  );
  saveLeads(leads);
}

export function removeInteraction(leadId: string, interactionId: string) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.interactions = (lead.interactions || []).filter((i) => i.id !== interactionId);
  saveLeads(leads);
}

// ===== Movement Events =====

export function getMovementEvents(): MovementEvent[] {
  return loadFromStorage<MovementEvent[]>("p21_movements", []);
}

export function saveMovementEvents(events: MovementEvent[]) {
  saveToStorage("p21_movements", events);
}

const CALL_STAGE_HINTS = ["tentativa", "ligação", "ligacao", "call"];
const MESSAGE_STAGE_HINTS = ["mensagem", "whatsapp", "wpp", "msg"];
const MEETING_STAGE_HINTS = ["reunião", "reuniao", "meeting"];

export function trackMovement(leadId: string, toStage: PipelineStage) {
  const lower = toStage.toLowerCase();
  let type: MovementEvent["type"] = "other";
  if (CALL_STAGE_HINTS.some((h) => lower.includes(h))) type = "call";
  else if (MESSAGE_STAGE_HINTS.some((h) => lower.includes(h))) type = "message";
  else if (MEETING_STAGE_HINTS.some((h) => lower.includes(h))) type = "meeting";

  const events = getMovementEvents();
  events.push({
    id: crypto.randomUUID(),
    leadId,
    toStage,
    timestamp: new Date().toISOString(),
    type,
  });
  saveMovementEvents(events);
}

// ===== Move lead between stages (cross-pipeline allowed) =====
export function moveLeadToStage(leadId: string, toStage: PipelineStage): { autoTransfer?: PipelineName; missingContractValue?: boolean } {
  trackMovement(leadId, toStage);
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return {};

  const fromStage = lead.stage;
  const fromPipeline = getPipelineForStage(fromStage);

  // Auto-promote: when moved to "Ganho", forward to first Onboarding stage
  let effectiveStage = toStage;
  if (toStage === "Ganho") {
    const onboardingStages = getStagesForPipeline("onboarding");
    if (onboardingStages.length > 0) effectiveStage = onboardingStages[0];
  }

  const toPipeline = getPipelineForStage(effectiveStage);

  lead.stage = effectiveStage;
  lead.stageChangedAt = new Date().toISOString();
  saveLeads(leads);

  // Emissões: evento genérico + específicos por classe de etapa
  emit(
    "LeadMovido",
    { leadId: lead.id, company: lead.company, fromStage, toStage: effectiveStage },
    `move:${lead.id}:${effectiveStage}:${lead.stageChangedAt}`
  );
  const kind = classifyStage(effectiveStage);
  if (kind === "call") emit("LigacaoRegistrada", { leadId: lead.id, company: lead.company, stage: effectiveStage });
  if (kind === "message") emit("MensagemRegistrada", { leadId: lead.id, company: lead.company, stage: effectiveStage });
  if (effectiveStage.toLowerCase().includes("realizada") && effectiveStage.toLowerCase().includes("reuni")) {
    emit("ReuniaoRealizada", { leadId: lead.id, company: lead.company });
  }

  let missingContractValue = false;

  // Auto-create finance revenue when WINNING an Oportunidade (moved to "Ganho" from Oportunidades)
  if (toStage === "Ganho" && fromPipeline === "oportunidades") {
    if ((lead.contractValue ?? 0) > 0) {
      import("./finance").then(({ upsertOnboardingRevenue }) => {
        upsertOnboardingRevenue({
          clientId: lead.id,
          clientName: lead.company,
          amount: lead.contractValue!,
          serviceType: lead.serviceType,
        });
      });
      emit("VendaRealizada", { leadId: lead.id, company: lead.company, amount: lead.contractValue }, `venda:${lead.id}`);
      emit("OnboardingIniciado", { leadId: lead.id, company: lead.company }, `onb:${lead.id}`);
    } else {
      missingContractValue = true;
      emit("VendaRealizada", { leadId: lead.id, company: lead.company, amount: 0 }, `venda:${lead.id}`);
    }
  } else if (fromPipeline !== "onboarding" && toPipeline === "onboarding") {
    emit("OnboardingIniciado", { leadId: lead.id, company: lead.company }, `onb:${lead.id}`);
  }

  // Reminders: fire user-configured templates for the destination stage.
  import("./reminders").then(({ createRemindersForStageChange }) => {
    createRemindersForStageChange(lead, effectiveStage);
  });

  return {
    ...(fromPipeline !== toPipeline ? { autoTransfer: toPipeline } : {}),
    ...(missingContractValue ? { missingContractValue: true } : {}),
  };
}


// ===== Pomodoro Sessions =====
export function getSessions(): PomodoroSession[] {
  return loadFromStorage<PomodoroSession[]>("p21_sessions", []);
}

export function saveSessions(sessions: PomodoroSession[]) {
  saveToStorage("p21_sessions", sessions);
}

export function addSession(session: Omit<PomodoroSession, "id">): PomodoroSession {
  const sessions = getSessions();
  const newSession: PomodoroSession = { ...session, id: crypto.randomUUID() };
  sessions.push(newSession);
  saveSessions(sessions);
  emit(
    "PomodoroFinalizado",
    {
      sessionId: newSession.id,
      durationMinutes: newSession.durationMinutes,
      calls: newSession.calls,
      connections: newSession.connections,
      decisionMakers: newSession.decisionMakers,
      meetings: newSession.meetings,
      niche: newSession.niche,
      scriptUsed: newSession.scriptUsed,
    },
    `pomo:${newSession.id}`
  );
  return newSession;
}

export function updateSession(id: string, patch: Partial<Omit<PomodoroSession, "id">>): PomodoroSession | null {
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: PomodoroSession = { ...sessions[idx], ...patch };
  sessions[idx] = updated;
  saveSessions(sessions);
  emit(
    "PomodoroFinalizado",
    {
      sessionId: updated.id,
      durationMinutes: updated.durationMinutes,
      calls: updated.calls,
      connections: updated.connections,
      decisionMakers: updated.decisionMakers,
      meetings: updated.meetings,
      niche: updated.niche,
      scriptUsed: updated.scriptUsed,
      edited: true,
    },
    `pomo:${updated.id}:edit:${Date.now()}`
  );
  return updated;
}

export function deleteSession(id: string): boolean {
  const sessions = getSessions();
  const next = sessions.filter((s) => s.id !== id);
  if (next.length === sessions.length) return false;
  saveSessions(next);
  emit("PomodoroFinalizado", { sessionId: id, deleted: true }, `pomo:${id}:del:${Date.now()}`);
  return true;
}

// ===== Meetings =====
export function getMeetings(): Meeting[] {
  return loadFromStorage<Meeting[]>("p21_meetings", []);
}

export function getMeetingsForLead(leadId: string): Meeting[] {
  return getMeetings()
    .filter((m) => m.leadId === leadId)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}

export function saveMeetings(meetings: Meeting[]) {
  saveToStorage("p21_meetings", meetings);
}

export function updateMeetingSource(meetingId: string, source: MeetingSource) {
  const meetings = getMeetings();
  const idx = meetings.findIndex((m) => m.id === meetingId);
  if (idx !== -1) {
    meetings[idx] = { ...meetings[idx], source };
    saveMeetings(meetings);
  }
}

export function updateMeetingDateTime(meetingId: string, date: string, time: string) {
  const meetings = getMeetings();
  const idx = meetings.findIndex((m) => m.id === meetingId);
  if (idx === -1) return;
  const updated = { ...meetings[idx], date, time };
  meetings[idx] = updated;
  saveMeetings(meetings);

  // Recreate reminders anchored to the meeting for the current stage
  const lead = getLeads().find((l) => l.id === updated.leadId);
  if (lead) {
    import("./reminders").then(({ createRemindersForStageChange }) => {
      createRemindersForStageChange(lead, lead.stage);
    });
    emit(
      "ReuniaoAtualizada",
      { meetingId, leadId: updated.leadId, company: lead.company, date, time },
      `mtg:${meetingId}:${date}:${time}`
    );
  }
  return updated;
}

export function scheduleMeeting(
  leadId: string,
  data: Omit<Meeting, "id" | "leadId" | "company" | "createdAt">,
  options?: { skipAutoMove?: boolean }
): { meeting: Meeting; autoTransfer?: PipelineName } {
  const lead = getLeads().find((l) => l.id === leadId);
  if (!lead) throw new Error("Lead não encontrado");

  const meeting: Meeting = {
    ...data,
    id: crypto.randomUUID(),
    leadId,
    company: lead.company,
    createdAt: new Date().toISOString(),
  };
  const meetings = getMeetings();
  meetings.push(meeting);
  saveMeetings(meetings);

  emit(
    "ReuniaoMarcada",
    {
      meetingId: meeting.id,
      leadId,
      company: lead.company,
      date: meeting.date,
      time: meeting.time,
      source: meeting.source,
      title: meeting.title,
    },
    `mtg:new:${meeting.id}`
  );

  if (options?.skipAutoMove) {
    return { meeting };
  }

  // Move lead to "Reunião Marcada" (oportunidades) — this triggers
  // any user-configured reminder templates for that stage.
  const result = moveLeadToStage(leadId, "Reunião Marcada");

  return { meeting, autoTransfer: result.autoTransfer };
}


// ===== Goals (Metas) settings =====
export interface GoalsSettings {
  monthlyRevenueGoal: number;
  averageTicket: number;
  // Conversion rates as percentages (0-100)
  callToConnection: number;
  connectionToDecisionMaker: number;
  decisionMakerToMeetingScheduled: number;
  meetingScheduledToHeld: number;
  meetingHeldToClose: number;
  // Time management
  workingDaysPerWeek: number;
  hoursPerDay: number;
  minutesPerCall: number;
}

export const DEFAULT_GOALS: GoalsSettings = {
  monthlyRevenueGoal: 30000,
  averageTicket: 3000,
  callToConnection: 30,
  connectionToDecisionMaker: 50,
  decisionMakerToMeetingScheduled: 25,
  meetingScheduledToHeld: 70,
  meetingHeldToClose: 30,
  workingDaysPerWeek: 5,
  hoursPerDay: 4,
  minutesPerCall: 4,
};

export function getGoalsSettings(): GoalsSettings {
  return loadFromStorage<GoalsSettings>("p21_goals_settings", DEFAULT_GOALS);
}

export function saveGoalsSettings(settings: GoalsSettings) {
  saveToStorage("p21_goals_settings", settings);
}

// ===== Diagnóstico Automático (V1.1) =====
// Fingerprint das interações consideradas — muda quando chega uma nova ligação
// ou uma interação é editada. Comparação simples: contagem + IDs + datas.
export function computeDiagnosisInputHash(lead: Lead): string {
  const parts = (lead.interactions || [])
    .map((i) => `${i.id}:${i.date}`)
    .sort();
  const notesLen = (lead.notes || "").length;
  return `n${parts.length}|${notesLen}|${parts.join(",")}`;
}

export function setLeadAutoDiagnosis(leadId: string, diagnosis: AutoDiagnosis) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.autoDiagnosis = diagnosis;
  saveLeads(leads);
}

export function isAutoDiagnosisStale(lead: Lead): boolean {
  if (!lead.autoDiagnosis) return false;
  return lead.autoDiagnosis.inputHash !== computeDiagnosisInputHash(lead);
}
