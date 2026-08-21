import { uload, usave } from "@/shared/services/userStorage";
import { emit } from "@/shared/services/eventBus";

// ==========================================
// CONSTANTS & KEYS
// ==========================================

export const PIPELINES = ["cold_call", "oportunidades", "onboarding"] as const;
export type PipelineName = (typeof PIPELINES)[number];

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
  "Tentativas Concluídas",
] as const;

export const DEFAULT_OPORTUNIDADES_STAGES = [
  "Reunião Marcada",
  "Reunião Realizada",
  "Aguardando Alinhamento",
  "Proposta Enviada",
  "Follow-up",
  "Ganho",
  "Perdido",
] as const;

export const DEFAULT_ONBOARDING_STAGES = [
  "Implementação",
  "Configuração",
  "Treinamento",
  "Sucesso do Cliente",
  "Projeto Concluído",
] as const;

export const COLD_CALL_STAGES = DEFAULT_COLD_CALL_STAGES;
export const OPORTUNIDADES_STAGES = DEFAULT_OPORTUNIDADES_STAGES;
export const ONBOARDING_STAGES = DEFAULT_ONBOARDING_STAGES;

export type PipelineStage = string;
export type ICPStars = 1 | 2 | 3 | 4 | 5;
export type InteractionType = "Ligação" | "WhatsApp" | "E-mail" | "Reunião" | "Outro" | "Follow-up" | "Envio de Proposta" | "Visita Presencial" | "Reunião Comercial" | "Reunião de Diagnóstico" | "Reunião de Apresentação";
export type MeetingSource = "Manual" | "Disparo" | "GMN" | "Ligação";

const STORAGE_KEY = "p21_leads";
const STAGES_KEY_PREFIX = "p21_stages_";
const SESSIONS_KEY = "p21_sessions";
const MOVEMENTS_KEY = "p21_movements";
const MEETINGS_KEY = "p21_meetings";
const GOALS_KEY = "p21_goals_settings";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface AutoDiagnosis {
  summary: string;
  temperature: "quente" | "morno" | "frio";
  next_action: string;
  attention?: string;
  updated_memory?: string;
  changes?: string;
  generatedAt: string;
  probability?: number;
  inputHash?: string;
  pain_points?: string[];
}

export interface CallAuditData {
  resumoExecutivo: string;
  evolucaoLead: string;
  tendenciaJustificativa: string;
  objecoes: string[];
  pontosPositivos?: string[];
  pontosAtencao?: string[];
  oportunidadeComercial?: string[];
  scoreComercial: number;
  temperatura: string;
  probabilidadeAvanco: string;
  prioridade: string;
  tendencia: string;
  feedbackVendedor: string;
  planoFollowup: Array<{ quando: string; acao: string }>;
  dataProximoContato?: string;
  diasAteProximoFollowup?: number | string;
  assuntosDeInteresse?: string[];
  nextBestAction?: any;
  proximaAcao?: string;
  principalObjecao?: string;
  recomendacaoEstrategica?: string;
}

export interface CallNoteAnalysis {
  markdown: string;
  data: CallAuditData;
  mode?: "full" | "quick";
}

export interface CallNote {
  id: string;
  text: string;
  createdAt: string;
  sellerId?: string;
  scriptUsed?: string;
  analysis?: CallNoteAnalysis;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  date: string;
  createdAt?: string;
  title: string;
  summary: string;
  sellerNotes?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  aiAnalysis?: string;
  createdAt?: string;
}

export interface DiagnosisVersion {
  id: string;
  version?: number;
  at: string;
  generatedAt?: string;
  summary?: string;
  temperature?: string;
  next_action?: string;
  attention?: string;
  updated_memory?: string;
  origin?: string;
  context?: string;
  diagnosis?: any;
  changes?: string[];
}

export interface Lead {
  id: string;
  company: string;
  contact?: string;
  phone?: string;
  whatsapp?: string;
  phoneNormalized?: string;
  phoneInvalid?: boolean;
  email?: string;
  website?: string;
  niche?: string;
  city?: string;
  gmnLink?: string;
  instagramLink?: string;
  notes?: string;
  googleRating?: number;
  googleReviews?: number;
  icpStars: ICPStars;
  runsAds: boolean;
  serviceType?: string;
  contractValue?: number;
  tags?: string[];
  stage: PipelineStage;
  stageChangedAt: string;
  createdAt: string;
  interactions?: Interaction[];
  callNotes?: CallNote[];
  attachments?: Attachment[];
  autoDiagnosis?: AutoDiagnosis;
  diagnosisHistory?: DiagnosisVersion[];
  dialAttempts?: number;
  lastDialSentAt?: string;
  lastDialCampaign?: string;
  lastDialCampaignId?: string;
  lastDialContactId?: string;
  dialStatus?: "enviado" | "erro";
  temperature?: "hot" | "warm" | "cold" | string;
}

export interface PomodoroSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  actualDurationSec?: number;
  calls: number;
  connections: number;
  decisionMakers: number;
  meetings: number;
  follows: number;
  noes: number;
  r1s: number;
  followsToDo?: number;
  negatives?: number;
  niche?: string;
  scriptUsed?: string;
}

export interface MovementEvent {
  id: string;
  leadId: string;
  fromStage?: string;
  toStage?: string;
  timestamp: string;
  type: "movement" | "call" | "interaction" | "meeting";
}

export interface Meeting {
  id: string;
  leadId: string;
  company: string;
  date: string;
  time: string;
  title: string;
  contactName: string;
  channel: string;
  source: MeetingSource;
  link?: string;
  meetLink?: string;
  googleEventId?: string;
  googleEventUrl?: string;
  attendeeEmail?: string;
  notes?: string;
  createdAt: string;
}

export interface GoalsSettings {
  monthlyRevenueGoal: number;
  averageTicket: number;
  callToConnection: number;
  connectionToDecisionMaker: number;
  decisionMakerToMeetingScheduled: number;
  meetingScheduledToHeld: number;
  meetingHeldToClose: number;
  workingDaysPerWeek: number;
  hoursPerDay: number;
  minutesPerCall: number;
}

// ==========================================
// CORE PERSISTENCE (INTERNAL)
// ==========================================

function loadLeads(): Lead[] {
  const leads = uload<Lead[]>(STORAGE_KEY, []);
  let needsSync = false;
  const migrated = leads.map(l => {
    if (!l.tags) {
      needsSync = true;
      return { ...l, tags: ["GMN"] };
    }
    return l;
  });
  if (needsSync) {
    usave(STORAGE_KEY, migrated);
    return migrated;
  }
  return leads;
}

function saveLeadsInternal(leads: Lead[]) {
  usave(STORAGE_KEY, leads);
  emit("LeadAtualizado", leads);
}

// ==========================================
// PUBLIC API: LEADS
// ==========================================

export function getLeads(): Lead[] {
  return loadLeads();
}

export function saveLeads(leads: Lead[]) {
  saveLeadsInternal(leads);
}

export function findLeadById(id: string): Lead | undefined {
  return getLeads().find(l => l.id === id);
}

export function addLead(data: Omit<Lead, "id" | "createdAt" | "stageChangedAt" | "attachments"> & { stage?: string }, stage?: PipelineStage): Lead {
  const now = new Date().toISOString();
  const finalStage = stage || data.stage || DEFAULT_COLD_CALL_STAGES[0];
  const { stage: dataStage, ...rest } = data;
  const newLead: Lead = {
    ...rest,
    id: crypto.randomUUID(),
    createdAt: now,
    stageChangedAt: now,
    stage: finalStage,
    attachments: [],
    interactions: [],
    callNotes: [],
    tags: data.tags || ["GMN"]
  };
  const all = getLeads();
  all.push(newLead);
  saveLeads(all);
  emit("LeadCriado", newLead);
  return newLead;
}

export function addLeadsBatch(leadsData: (Omit<Lead, "id" | "createdAt" | "stageChangedAt" | "attachments"> & { stage?: string })[], stage: PipelineStage) {
  const now = new Date().toISOString();
  const newLeads: Lead[] = leadsData.map(data => {
    const finalStage = stage || data.stage || DEFAULT_COLD_CALL_STAGES[0];
    const { stage: dataStage, ...rest } = data;
    return {
      ...rest,
      id: crypto.randomUUID(),
      stage: finalStage,
      createdAt: now,
      stageChangedAt: now,
      attachments: [],
      interactions: [],
      callNotes: [],
      tags: data.tags || ["GMN"]
    };
  });
  const all = getLeads();
  all.push(...newLeads);
  saveLeads(all);
  newLeads.forEach(l => emit("LeadCriado", l));
}

export function updateLead(id: string, updates: Partial<Lead>) {
  const all = getLeads();
  const idx = all.findIndex(l => l.id === id);
  if (idx === -1) return;
  
  const oldStage = all[idx].stage;
  all[idx] = { ...all[idx], ...updates };
  
  if (updates.stage && updates.stage !== oldStage) {
    all[idx].stageChangedAt = new Date().toISOString();
  }
  
  saveLeads(all);
}

export function updateLeadStage(id: string, stage: PipelineStage) {
  return updateLead(id, { stage });
}

export function updateLeadsBatch(ids: Set<string> | string[], updates: Partial<Lead>) {
  const idArray = Array.from(ids);
  const all = getLeads();
  let changed = false;
  const now = new Date().toISOString();

  idArray.forEach(id => {
    const idx = all.findIndex(l => l.id === id);
    if (idx !== -1) {
      const oldStage = all[idx].stage;
      all[idx] = { ...all[idx], ...updates };
      if (updates.stage && updates.stage !== oldStage) {
        all[idx].stageChangedAt = now;
      }
      changed = true;
    }
  });

  if (changed) saveLeads(all);
}

export function deleteLead(id: string) {
  const all = getLeads().filter(l => l.id !== id);
  saveLeads(all);
}

export function deleteLeadsBatch(ids: Set<string> | string[]) {
  const idArray = new Set(Array.from(ids));
  const all = getLeads().filter(l => !idArray.has(l.id));
  saveLeads(all);
}

export function dedupeLeads(): number {
  const all = getLeads();
  const seen = new Set<string>();
  const unique: Lead[] = [];
  let removed = 0;
  all.forEach(l => {
    const key = `${l.company.toLowerCase().trim()}|${(l.phone || "").replace(/\D/g, "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(l);
    } else {
      removed++;
    }
  });
  if (removed > 0) saveLeads(unique);
  return removed;
}

// ==========================================
// PUBLIC API: PIPELINE & STAGES
// ==========================================

export function getStagesForPipeline(pipeline: PipelineName): PipelineStage[] {
  const defaults = {
    cold_call: DEFAULT_COLD_CALL_STAGES,
    oportunidades: DEFAULT_OPORTUNIDADES_STAGES,
    onboarding: DEFAULT_ONBOARDING_STAGES
  };
  return uload<string[]>(STAGES_KEY_PREFIX + pipeline, [...defaults[pipeline]]);
}

export function saveStagesForPipeline(pipeline: PipelineName, stages: PipelineStage[]) {
  usave(STAGES_KEY_PREFIX + pipeline, stages);
  emit("MetaAtualizada", { pipeline, stages });
}

export function getPipelineForStage(stage: PipelineStage): PipelineName {
  if (DEFAULT_COLD_CALL_STAGES.includes(stage as any)) return "cold_call";
  if (DEFAULT_OPORTUNIDADES_STAGES.includes(stage as any)) return "oportunidades";
  return "onboarding";
}

export function moveLeadToStage(id: string, newStage: PipelineStage) {
  const all = getLeads();
  const idx = all.findIndex(l => l.id === id);
  if (idx === -1) return { missingContractValue: false, autoTransfer: undefined };

  const lead = all[idx];
  const oldStage = lead.stage;
  const oldPipeline = getPipelineForStage(oldStage);
  const newPipeline = getPipelineForStage(newStage);

  lead.stage = newStage;
  lead.stageChangedAt = new Date().toISOString();

  // Log movement
  const movements = uload<MovementEvent[]>(MOVEMENTS_KEY, []);
  movements.push({
    id: crypto.randomUUID(),
    leadId: id,
    fromStage: oldStage,
    toStage: newStage,
    timestamp: lead.stageChangedAt,
    type: "movement"
  });
  usave(MOVEMENTS_KEY, movements.slice(-5000));

  saveLeads(all);
  emit("LeadMovido", { leadId: id, from: oldStage, to: newStage });

  let autoTransfer: PipelineName | undefined;
  if (newStage === "Ganho" && newPipeline === "oportunidades") {
    autoTransfer = "onboarding";
    updateLead(id, { stage: DEFAULT_ONBOARDING_STAGES[0] });
  }

  return { 
    missingContractValue: newStage === "Ganho" && !lead.contractValue,
    autoTransfer 
  };
}

export function moveLeadsToStageBatch(ids: Set<string> | string[], newStage: PipelineStage) {
  let autoTransfer: PipelineName | undefined;
  Array.from(ids).forEach(id => {
    const res = moveLeadToStage(id, newStage);
    if (res.autoTransfer) autoTransfer = res.autoTransfer;
  });
  return { autoTransfer };
}

// Stage Management
export function addStage(pipeline: PipelineName, name: string) {
  const stages = getStagesForPipeline(pipeline);
  if (!stages.includes(name)) {
    stages.push(name);
    saveStagesForPipeline(pipeline, stages);
    return { ok: true, error: null };
  }
  return { ok: false, error: "Etapa já existe" };
}

export function removeStage(pipeline: PipelineName, name: string) {
  const stages = getStagesForPipeline(pipeline).filter(s => s !== name);
  saveStagesForPipeline(pipeline, stages);
}

export function renameStage(pipeline: PipelineName, oldName: string, newName: string) {
  const stages = getStagesForPipeline(pipeline).map(s => s === oldName ? newName : s);
  saveStagesForPipeline(pipeline, stages);
  
  const leads = getLeads();
  leads.forEach(l => { if (l.stage === oldName) l.stage = newName; });
  saveLeads(leads);
  return { ok: true };
}

export function reorderStages(pipeline: PipelineName, stages: PipelineStage[]) {
  saveStagesForPipeline(pipeline, stages);
}

export function getLeadsForPipeline(pipeline: PipelineName): Lead[] {
  const stages = new Set(getStagesForPipeline(pipeline));
  return getLeads().filter(l => stages.has(l.stage));
}

// ==========================================
// PUBLIC API: SESSIONS (POMODORO)
// ==========================================

export function getSessions(): PomodoroSession[] {
  return uload<PomodoroSession[]>(SESSIONS_KEY, []);
}

export function addSession(session: Omit<PomodoroSession, "id">) {
  const all = getSessions();
  const newSession = { ...session, id: crypto.randomUUID() };
  all.push(newSession);
  usave(SESSIONS_KEY, all);
  emit("PomodoroFinalizado", newSession);
  return newSession;
}

export function updateSession(id: string, updates: Partial<PomodoroSession>) {
  const all = getSessions();
  const idx = all.findIndex(s => s.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates };
    usave(SESSIONS_KEY, all);
  }
}

export function deleteSession(id: string) {
  usave(SESSIONS_KEY, getSessions().filter(s => s.id !== id));
}

// ==========================================
// PUBLIC API: MEETINGS
// ==========================================

export function getMeetings(): Meeting[] {
  return uload<Meeting[]>(MEETINGS_KEY, []);
}

export function getMeetingsForLead(leadId: string): Meeting[] {
  return getMeetings().filter(m => m.leadId === leadId);
}

export function scheduleMeeting(leadId: string, meeting: Omit<Meeting, "id" | "createdAt" | "leadId">, options: { skipAutoMove?: boolean } = {}) {
  const all = getMeetings();
  const newMeeting = { ...meeting, leadId, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  all.push(newMeeting);
  usave(MEETINGS_KEY, all);
  emit("ReuniaoMarcada", newMeeting);
  
  return { autoTransfer: undefined }; 
}

export function updateMeetingDateTime(id: string, date: string, time: string) {
  const all = getMeetings();
  const idx = all.findIndex(m => m.id === id);
  if (idx !== -1) {
    all[idx].date = date;
    all[idx].time = time;
    usave(MEETINGS_KEY, all);
    emit("ReuniaoAtualizada", all[idx]);
  }
}

export function updateMeetingSource(id: string, source: MeetingSource) {
  const all = getMeetings();
  const idx = all.findIndex(m => m.id === id);
  if (idx !== -1) {
    all[idx].source = source;
    usave(MEETINGS_KEY, all);
  }
}

// ==========================================
// PUBLIC API: MOVEMENT EVENTS
// ==========================================

export function getMovementEvents(): MovementEvent[] {
  return uload<MovementEvent[]>(MOVEMENTS_KEY, []);
}

// ==========================================
// PUBLIC API: GOALS
// ==========================================

export function getGoalsSettings(): GoalsSettings {
  return uload<GoalsSettings>(GOALS_KEY, {
    monthlyRevenueGoal: 10000,
    averageTicket: 1000,
    callToConnection: 20,
    connectionToDecisionMaker: 30,
    decisionMakerToMeetingScheduled: 10,
    meetingScheduledToHeld: 70,
    meetingHeldToClose: 20,
    workingDaysPerWeek: 5,
    hoursPerDay: 4,
    minutesPerCall: 5
  });
}

export function saveGoalsSettings(settings: GoalsSettings) {
  usave(GOALS_KEY, settings);
  emit("MetaAtualizada", settings);
}

// ==========================================
// PUBLIC API: ATTACHMENTS, NOTES, INTERACTIONS
// ==========================================

export function addAttachment(leadId: string, att: Omit<Attachment, "id">) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead) {
    if (!lead.attachments) lead.attachments = [];
    const newAtt = { ...att, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    lead.attachments.push(newAtt);
    saveLeads(all);
    return newAtt.id;
  }
}

export function removeAttachment(leadId: string, attId: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.attachments) {
    lead.attachments = lead.attachments.filter(a => a.id !== attId);
    saveLeads(all);
  }
}

export function setAttachmentAnalysis(leadId: string, attId: string, analysis: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.attachments) {
    const att = lead.attachments.find(a => a.id === attId);
    if (att) {
      att.aiAnalysis = analysis;
      saveLeads(all);
    }
  }
}

export function addCallNote(leadId: string, noteData: string | Omit<CallNote, "id" | "createdAt">, scriptUsed?: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead) {
    if (!lead.callNotes) lead.callNotes = [];
    let note: Omit<CallNote, "id" | "createdAt">;
    if (typeof noteData === "string") {
      note = { text: noteData, scriptUsed };
    } else {
      note = noteData;
    }
    const newNote = { ...note, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    lead.callNotes.push(newNote);
    saveLeads(all);
    emit("InteracaoRegistrada", { leadId, type: "Ligação" });
  }
}

export function removeCallNote(leadId: string, noteId: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.callNotes) {
    lead.callNotes = lead.callNotes.filter(n => n.id !== noteId);
    saveLeads(all);
  }
}

export function setCallNoteAnalysis(leadId: string, noteId: string, analysis: CallNoteAnalysis) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.callNotes) {
    const note = lead.callNotes.find(n => n.id === noteId);
    if (note) {
      note.analysis = analysis;
      saveLeads(all);
    }
  }
}

export function addInteraction(leadId: string, interaction: Omit<Interaction, "id">) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead) {
    if (!lead.interactions) lead.interactions = [];
    const newInt = { ...interaction, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    lead.interactions.push(newInt);
    saveLeads(all);
    emit("InteracaoRegistrada", { leadId, ...newInt });
  }
}

export function updateInteraction(leadId: string, id: string, updates: Partial<Interaction>) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.interactions) {
    const idx = lead.interactions.findIndex(i => i.id === id);
    if (idx !== -1) {
      lead.interactions[idx] = { ...lead.interactions[idx], ...updates };
      saveLeads(all);
    }
  }
}

export function removeInteraction(leadId: string, id: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead && lead.interactions) {
    lead.interactions = lead.interactions.filter(i => i.id !== id);
    saveLeads(all);
  }
}

// ==========================================
// PUBLIC API: DIAGNOSIS
// ==========================================

export function setLeadAutoDiagnosis(leadId: string, diag: AutoDiagnosis) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead) {
    lead.autoDiagnosis = diag;
    saveLeads(all);
  }
}

export function pushLeadDiagnosisVersion(leadId: string, diagnosis: any, changes: string[], origin: string) {
  const all = getLeads();
  const lead = all.find(l => l.id === leadId);
  if (lead) {
    if (!lead.diagnosisHistory) lead.diagnosisHistory = [];
    const newVersion: DiagnosisVersion = {
      id: crypto.randomUUID(),
      version: lead.diagnosisHistory.length + 1,
      at: new Date().toISOString(),
      origin,
      context: lead.stage,
      diagnosis,
      changes
    };
    lead.diagnosisHistory.unshift(newVersion);
    saveLeads(all);
    return newVersion;
  }
}

export function getDiagnosisHistory(lead: Lead): DiagnosisVersion[] {
  return lead.diagnosisHistory || [];
}

export function isAutoDiagnosisStale(lead: Lead): boolean {
  if (!lead.autoDiagnosis) return true;
  return new Date(lead.stageChangedAt) > new Date(lead.autoDiagnosis.generatedAt);
}

export function computeDiagnosisInputHash(lead: Lead): string {
  // Simple hash of content that affects diagnosis
  const content = [
    lead.notes,
    lead.stage,
    (lead.callNotes || []).length,
    (lead.interactions || []).length
  ].join("|");
  return content; 
}

// ==========================================
// PUBLIC API: TAGS
// ==========================================

export function getAllTags(): string[] {
  const leads = getLeads();
  const tags = new Set<string>(["GMN", "LUPUS", "INBOUND"]);
  leads.forEach(l => {
    l.tags?.forEach(t => tags.add(t));
  });
  return Array.from(tags).sort();
}
