// ===== Pipeline Definitions =====
export const COLD_CALL_STAGES = [
  "Novo Lead",
  "Tentativa 1",
  "Mensagem WhatsApp",
  "Tentativa 2",
  "Tentativa 3",
  "Tentativa 4",
  "Tentativa 5",
  "Tentativa 6",
  "Tentativa 7",
  "Tentativa 8",
] as const;

export const OPORTUNIDADES_STAGES = [
  "Reunião Marcada",
  "Reunião Realizada",
  "Documento de Guerra",
  "Proposta Enviada",
  "Ganho",
  "Perdido",
] as const;

export const OPERACAO_STAGES = [
  "Onboarding",
  "Exploração",
  "Lapidação",
  "Escala",
  "Extração",
] as const;

export const ALL_STAGES = [
  ...COLD_CALL_STAGES,
  ...OPORTUNIDADES_STAGES,
  ...OPERACAO_STAGES,
] as const;

// Keep legacy export for compatibility
export const PIPELINE_STAGES = ALL_STAGES;

export type ColdCallStage = (typeof COLD_CALL_STAGES)[number];
export type OportunidadesStage = (typeof OPORTUNIDADES_STAGES)[number];
export type OperacaoStage = (typeof OPERACAO_STAGES)[number];
export type PipelineStage = (typeof ALL_STAGES)[number];
export type PipelineName = "cold_call" | "oportunidades" | "operacao";

export type ICPStars = 1 | 2 | 3;

export interface LeadAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  company: string;
  contact: string;
  phone: string;
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
  // Operação fields
  setupValue?: number;
  monthlyFee?: number;
  adBudget?: number;
  contractStart?: string;
  contractRenewal?: string;
}

export interface PomodoroSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  calls: number;
  messages: number;
  meetings: number;
}

export interface MovementEvent {
  id: string;
  leadId: string;
  toStage: PipelineStage;
  timestamp: string;
  type: "call" | "message" | "meeting" | "other";
}

// ===== Helpers =====
export function getPipelineForStage(stage: PipelineStage): PipelineName {
  if ((COLD_CALL_STAGES as readonly string[]).includes(stage)) return "cold_call";
  if ((OPORTUNIDADES_STAGES as readonly string[]).includes(stage)) return "oportunidades";
  return "operacao";
}

export function getStagesForPipeline(pipeline: PipelineName): readonly PipelineStage[] {
  if (pipeline === "cold_call") return COLD_CALL_STAGES;
  if (pipeline === "oportunidades") return OPORTUNIDADES_STAGES;
  return OPERACAO_STAGES;
}

export function getLeadsForPipeline(pipeline: PipelineName): Lead[] {
  const stages = getStagesForPipeline(pipeline) as readonly string[];
  return getLeads().filter((l) => stages.includes(l.stage));
}

// ===== Storage =====
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ===== Leads =====
export function getLeads(): Lead[] {
  const leads = loadFromStorage<Lead[]>("p21_leads", []);
  return leads.map((l) => ({
    ...l,
    icpStars: l.icpStars || ((l as any).icpProfile === "Não Fit" ? 1 : 3),
    attachments: l.attachments || [],
  }));
}

export function saveLeads(leads: Lead[]) {
  saveToStorage("p21_leads", leads);
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

// ===== Movement Events (non-linear: only tracks destination) =====
export function getMovementEvents(): MovementEvent[] {
  return loadFromStorage<MovementEvent[]>("p21_movements", []);
}

export function saveMovementEvents(events: MovementEvent[]) {
  saveToStorage("p21_movements", events);
}

const CALL_STAGES: string[] = [
  "Tentativa 1", "Tentativa 2", "Tentativa 3", "Tentativa 4",
  "Tentativa 5", "Tentativa 6", "Tentativa 7", "Tentativa 8",
];
const MESSAGE_STAGES: string[] = ["Mensagem WhatsApp"];
const MEETING_STAGES: string[] = ["Reunião Marcada", "Reunião Realizada"];

export function trackMovement(leadId: string, toStage: PipelineStage) {
  let type: MovementEvent["type"] = "other";
  if (CALL_STAGES.includes(toStage)) type = "call";
  else if (MESSAGE_STAGES.includes(toStage)) type = "message";
  else if (MEETING_STAGES.includes(toStage)) type = "meeting";

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

// ===== Auto-transfer logic =====
// Moving to "Reunião Marcada" from Cold Call → appears in Oportunidades
// Moving to "Ganho" → auto-creates in Operação "Onboarding"
export function moveLeadToStage(leadId: string, toStage: PipelineStage): { autoTransfer?: PipelineName } {
  trackMovement(leadId, toStage);
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return {};

  const fromPipeline = getPipelineForStage(lead.stage);
  const toPipeline = getPipelineForStage(toStage);

  lead.stage = toStage;
  lead.stageChangedAt = new Date().toISOString();

  // Auto-transfer to Operação when "Ganho"
  if (toStage === "Ganho") {
    // Clone lead into Operação
    const opLead: Lead = {
      ...lead,
      id: crypto.randomUUID(),
      stage: "Onboarding",
      stageChangedAt: new Date().toISOString(),
    };
    leads.push(opLead);
    saveLeads(leads);
    return { autoTransfer: "operacao" };
  }

  saveLeads(leads);
  return fromPipeline !== toPipeline ? { autoTransfer: toPipeline } : {};
}

// ===== Pomodoro =====
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
  return newSession;
}
