// ===== Pipeline Definitions (defaults; user can edit/persist) =====
export const DEFAULT_COLD_CALL_STAGES = [
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

export const DEFAULT_OPORTUNIDADES_STAGES = [
  "Reunião Marcada",
  "Reunião Realizada",
  "Documento de Guerra",
  "Proposta Enviada",
  "Ganho",
  "Perdido",
] as const;

// Legacy compatibility (some files still import these names)
export const COLD_CALL_STAGES = DEFAULT_COLD_CALL_STAGES;
export const OPORTUNIDADES_STAGES = DEFAULT_OPORTUNIDADES_STAGES;

export type PipelineStage = string;
export type PipelineName = "cold_call" | "oportunidades";

export type ICPStars = 1 | 2 | 3;

export interface LeadAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
}

export interface CallNote {
  id: string;
  text: string;
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
  callNotes?: CallNote[];
}

export interface Meeting {
  id: string;
  leadId: string;
  company: string;
  date: string; // ISO date
  time: string; // HH:mm
  contactName?: string;
  channel?: "Google Meet" | "Zoom" | "Presencial" | "Telefone" | "Outro";
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

// ===== Storage helpers =====
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

// ===== Custom stages persistence =====
const STAGES_KEYS: Record<PipelineName, string> = {
  cold_call: "p21_stages_cold_call",
  oportunidades: "p21_stages_oportunidades",
};

export function getStagesForPipeline(pipeline: PipelineName): PipelineStage[] {
  const fallback =
    pipeline === "cold_call"
      ? [...DEFAULT_COLD_CALL_STAGES]
      : [...DEFAULT_OPORTUNIDADES_STAGES];
  const stored = loadFromStorage<string[] | null>(STAGES_KEYS[pipeline], null);
  return stored && stored.length ? stored : fallback;
}

export function saveStagesForPipeline(pipeline: PipelineName, stages: PipelineStage[]) {
  saveToStorage(STAGES_KEYS[pipeline], stages);
}

export function renameStage(pipeline: PipelineName, oldName: string, newName: string) {
  if (!newName.trim() || oldName === newName) return;
  const stages = getStagesForPipeline(pipeline).map((s) => (s === oldName ? newName : s));
  saveStagesForPipeline(pipeline, stages);
  // update leads that referenced old name
  const leads = getLeads().map((l) => (l.stage === oldName ? { ...l, stage: newName } : l));
  saveLeads(leads);
}

export function addStage(pipeline: PipelineName, name: string) {
  if (!name.trim()) return;
  const stages = getStagesForPipeline(pipeline);
  if (stages.includes(name)) return;
  saveStagesForPipeline(pipeline, [...stages, name]);
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
  return "oportunidades";
}

export function getLeadsForPipeline(pipeline: PipelineName): Lead[] {
  const stages = getStagesForPipeline(pipeline);
  return getLeads().filter((l) => stages.includes(l.stage));
}

// ===== Leads =====
export function getLeads(): Lead[] {
  const leads = loadFromStorage<Lead[]>("p21_leads", []);
  return leads.map((l) => ({
    ...l,
    icpStars: l.icpStars || ((l as any).icpProfile === "Não Fit" ? 1 : 3),
    attachments: l.attachments || [],
    callNotes: l.callNotes || [],
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

export function addCallNote(leadId: string, text: string) {
  if (!text.trim()) return;
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.callNotes = [
      ...(lead.callNotes || []),
      { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() },
    ];
    saveLeads(leads);
  }
}

export function removeCallNote(leadId: string, noteId: string) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (lead) {
    lead.callNotes = (lead.callNotes || []).filter((n) => n.id !== noteId);
    saveLeads(leads);
  }
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
export function moveLeadToStage(leadId: string, toStage: PipelineStage): { autoTransfer?: PipelineName } {
  trackMovement(leadId, toStage);
  const leads = getLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return {};

  const fromPipeline = getPipelineForStage(lead.stage);
  const toPipeline = getPipelineForStage(toStage);

  lead.stage = toStage;
  lead.stageChangedAt = new Date().toISOString();
  saveLeads(leads);

  return fromPipeline !== toPipeline ? { autoTransfer: toPipeline } : {};
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
  return newSession;
}

// ===== Meetings =====
export function getMeetings(): Meeting[] {
  return loadFromStorage<Meeting[]>("p21_meetings", []);
}

export function saveMeetings(meetings: Meeting[]) {
  saveToStorage("p21_meetings", meetings);
}

export function scheduleMeeting(
  leadId: string,
  data: Omit<Meeting, "id" | "leadId" | "company" | "createdAt">
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

  // Move lead to "Reunião Marcada" (oportunidades)
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
