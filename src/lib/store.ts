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

export interface Lead {
  id: string;
  company: string;
  contact: string;
  phone: string;
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
