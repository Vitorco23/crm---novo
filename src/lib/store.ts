export const PIPELINE_STAGES = [
  "Novo Lead",
  "Tentativa 1",
  "Tentativa 2",
  "Mensagem no WhatsApp",
  "Tentativa 3",
  "Reunião Marcada",
  "Reunião Realizada",
  "Documento de Guerra Enviado",
  "Proposta Enviada",
  "Ganho",
  "Perdido",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ICPProfile = "Fit" | "Não Fit";

export interface Lead {
  id: string;
  company: string;
  contact: string;
  phone: string;
  niche: string;
  city: string;
  gmnLink: string;
  instagramLink: string;
  icpProfile: ICPProfile;
  runsAds: boolean;
  stage: PipelineStage;
  createdAt: string;
  stageChangedAt: string;
  notes: string;
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
  type: "call" | "message" | "other";
}

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

// Leads
export function getLeads(): Lead[] {
  return loadFromStorage<Lead[]>("p21_leads", []);
}

export function saveLeads(leads: Lead[]) {
  saveToStorage("p21_leads", leads);
}

export function addLead(lead: Omit<Lead, "id" | "createdAt" | "stageChangedAt" | "stage">): Lead {
  const leads = getLeads();
  const newLead: Lead = {
    ...lead,
    id: crypto.randomUUID(),
    stage: "Novo Lead",
    createdAt: new Date().toISOString(),
    stageChangedAt: new Date().toISOString(),
  };
  leads.push(newLead);
  saveLeads(leads);
  return newLead;
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

// Movement Events (auto-tracking)
export function getMovementEvents(): MovementEvent[] {
  return loadFromStorage<MovementEvent[]>("p21_movements", []);
}

export function saveMovementEvents(events: MovementEvent[]) {
  saveToStorage("p21_movements", events);
}

const CALL_STAGES: PipelineStage[] = ["Tentativa 1", "Tentativa 2", "Tentativa 3"];
const MESSAGE_STAGES: PipelineStage[] = ["Mensagem no WhatsApp"];

export function trackMovement(leadId: string, toStage: PipelineStage) {
  let type: MovementEvent["type"] = "other";
  if (CALL_STAGES.includes(toStage)) type = "call";
  else if (MESSAGE_STAGES.includes(toStage)) type = "message";

  if (type === "other") return; // only track calls and messages

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

// Pomodoro
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
