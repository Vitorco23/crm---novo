// User-configurable reminder templates per pipeline stage.
// When a lead moves to a stage that has templates, reminders are generated
// according to each template's offset (relative to stage change OR meeting time).
import { uload as loadFromStorage, usave as saveToStorage } from "@/shared/services/userStorage";
import type { Lead, Meeting } from "@/shared/services/store";
import { getMeetingsForLead } from "@/shared/services/store";

export type ReminderStatus = "pending" | "sent" | "dismissed";
export type ReminderAnchor = "stage_change" | "meeting";
export type ReminderDirection = "before" | "after";
export type ReminderUnit = "minutes" | "hours" | "days";

export interface Reminder {
  id: string;
  leadId: string;
  templateId?: string;
  stage?: string;
  meetingId?: string;
  kind: string;
  title: string;
  message: string;
  scheduledFor: string; // ISO
  status: ReminderStatus;
  createdAt: string;
  sentAt?: string;
  notified?: boolean;
}

export interface ReminderTemplate {
  id: string;
  stage: string; // pipeline stage name this template fires on
  title: string;
  message: string; // supports placeholders [nome] [empresa] [data da reunião] [hora da reunião] [link] [protocolo] [decisor]
  anchor: ReminderAnchor; // "stage_change" = when the lead enters this stage; "meeting" = relative to the lead's most recent meeting
  direction: ReminderDirection; // before | after the anchor (ignored for stage_change unless meeting has passed)
  offsetValue: number; // magnitude
  offsetUnit: ReminderUnit;
  enabled: boolean;
  createdAt: string;
}

const KEY = "p21_reminders";
const TEMPLATES_KEY = "p21_reminder_templates";

// ---------- Reminders CRUD ----------
export function getReminders(): Reminder[] {
  return loadFromStorage<Reminder[]>(KEY, []);
}
export function saveReminders(r: Reminder[]) {
  saveToStorage(KEY, r);
}
export function upsertReminders(newOnes: Reminder[]) {
  saveReminders([...getReminders(), ...newOnes]);
}
export function markReminderStatus(id: string, status: ReminderStatus) {
  const all = getReminders();
  const idx = all.findIndex((r) => r.id === id);
  if (idx !== -1) {
    all[idx] = {
      ...all[idx],
      status,
      sentAt: status === "sent" ? new Date().toISOString() : all[idx].sentAt,
    };
    saveReminders(all);
  }
}
export function markReminderNotified(id: string) {
  const all = getReminders();
  const idx = all.findIndex((r) => r.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], notified: true };
    saveReminders(all);
  }
}
export function deleteReminder(id: string) {
  saveReminders(getReminders().filter((r) => r.id !== id));
}

/** Cancel pending reminders for a lead. If `stages` given, only for those stages. */
export function cancelPendingReminders(leadId: string, stages?: string[]) {
  const all = getReminders();
  const kept = all.filter((r) => {
    if (r.leadId !== leadId) return true;
    if (r.status !== "pending") return true;
    if (stages && (!r.stage || !stages.includes(r.stage))) return true;
    return false;
  });
  saveReminders(kept);
}

// ---------- Templates CRUD ----------
export function getReminderTemplates(): ReminderTemplate[] {
  const stored = loadFromStorage<ReminderTemplate[] | null>(TEMPLATES_KEY, null);
  if (stored) return stored;
  // IMPORTANT: don't persist the seed here. Doing so during boot (before cloud
  // hydration finishes) would push defaults up and overwrite templates the
  // user configured on another device. Return seed in-memory only; the first
  // real user edit (upsert/delete) is what persists.
  return defaultSeedTemplates();
}
export function saveReminderTemplates(list: ReminderTemplate[]) {
  saveToStorage(TEMPLATES_KEY, list);
}
export function upsertReminderTemplate(t: ReminderTemplate) {
  const all = getReminderTemplates();
  const idx = all.findIndex((x) => x.id === t.id);
  if (idx === -1) all.push(t);
  else all[idx] = t;
  saveReminderTemplates(all);
}
export function deleteReminderTemplate(id: string) {
  saveReminderTemplates(getReminderTemplates().filter((t) => t.id !== id));
}

// ---------- Placeholder rendering ----------
function protocolFor(lead: Lead) {
  return "#" + lead.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
function firstName(name: string) {
  return (name || "").trim().split(/\s+/)[0] || name || "";
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Resumo da ligação mais recente do lead — mesma fonte que já alimenta a
 * priorização (`latestAudit()` em priorityLeads.ts): primeiro o diagnóstico
 * profundo (CallAuditData.resumoExecutivo, quando o Auditor Comercial foi
 * rodado manualmente numa ligação), senão o diagnóstico automático leve
 * (autoDiagnosis.summary, que roda sozinho em toda ligação do Matteline).
 */
function latestCallSummary(lead: Lead): string {
  const notes = lead.callNotes || [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const resumo = notes[i]?.analysis?.data?.resumoExecutivo;
    if (resumo) return resumo;
  }
  return lead.autoDiagnosis?.summary || "";
}

/**
 * Ajusta o resumo da ligação (já em frase corrida, escrito pela IA a partir
 * do resumo bruto do Callface) pro tom de mensagem curta de WhatsApp:
 * nomeia a pessoa em vez de "o lead" e nunca usa "marketing" (mesmo que o
 * texto original traga essa palavra), trocando por linguagem de Engenharia
 * de Receita. Puramente determinístico — não reescreve a lógica do resumo,
 * só esses dois ajustes de tom, direto no texto que a IA já produziu.
 */
function humanizeCallSummary(summary: string, nome: string): string {
  if (!summary) return summary;
  let out = summary;
  if (nome) {
    out = out.replace(/\bo\s+lead\b/gi, (match) => (match[0] === "O" ? `O ${nome}` : `o ${nome}`));
  }
  out = out.replace(/\bmarketing\b/gi, "estratégia comercial");
  // Colapsa pontuação duplicada que pode sobrar da troca acima (ex: "média..").
  out = out.replace(/([.!?]){2,}/g, "$1").replace(/\s{2,}/g, " ").trim();
  return out;
}

export function renderReminderTemplate(text: string, lead: Lead, meeting?: Meeting) {
  if (!text) return "";

  const nome = firstName(meeting?.contactName || lead.contact || lead.company);
  const empresa = lead.company;
  const decisor = lead.contact || lead.company;
  const meetingAt = meeting ? new Date(`${meeting.date}T${meeting.time}:00`) : null;

  // Data map with lowercased keys for normalization
  const map: Record<string, string> = {
    "nome": nome,
    "empresa": empresa,
    "data da reunião": meetingAt ? fmtDate(meetingAt) : "",
    "hora da reunião": meetingAt ? fmtTime(meetingAt) : "",
    "data": meetingAt ? fmtDate(meetingAt) : "", // alias
    "hora": meetingAt ? fmtTime(meetingAt) : "", // alias
    "link": meeting?.meetLink || meeting?.link || "",
    "protocolo": protocolFor(lead),
    "decisor": decisor,
    "responsavel": decisor, // alias
    // Mensagens de follow-up de cold call (fora do funil de reunião) — só
    // preenche o que dá pra inferir com segurança de dado estruturado
    // existente. "[contexto breve]" e "[sócio/pessoa]" ficam de propósito
    // sem mapeamento: exigem julgamento do que foi dito na ligação, então
    // permanecem como marcador literal no texto pro vendedor completar à
    // mão antes de enviar — o mesmo comportamento de fallback abaixo
    // (chave sem mapa = devolve o marcador original).
    "resumo curto": humanizeCallSummary(latestCallSummary(lead), nome).slice(0, 220),
    "assunto": lead.niche || "",
    // "Follow-up geral" (cold call): nicho é categoria, não assunto de
    // conversa — usa a empresa. Inclui o " sobre as oportunidades pra X"
    // inteiro (com o espaço à esquerda já embutido) pra sumir de vez,
    // sem sobrar espaço/pontuação estranha, quando não há empresa cadastrada.
    "assunto followup": empresa ? ` sobre as oportunidades pra ${empresa}` : "",
  };
  
  // Regex that captures content inside brackets, case-insensitive
  return text.replace(/\[([^\]]+)\]/gi, (match, p1) => {
    const key = p1.toLowerCase().trim();
    // Return mapped value or the original match if key not found
    return map[key] ?? match;
  });
}

/**
 * Force-refreshes all pending reminders for a lead by re-rendering their messages
 * from the latest lead data. Useful after a lead is edited.
 */
export function refreshPendingRemindersForLead(lead: Lead) {
  const all = getReminders();
  const meetings = getMeetingsForLead(lead.id);
  const meeting = meetings[0];
  
  const updated = all.map((r) => {
    if (r.leadId !== lead.id || r.status !== "pending" || !r.templateId) return r;
    
    const templates = getReminderTemplates();
    const t = templates.find(tpl => tpl.id === r.templateId);
    if (!t) return r;

    return {
      ...r,
      title: renderReminderTemplate(t.title, lead, meeting),
      message: renderReminderTemplate(t.message, lead, meeting),
    };
  });
  
  saveReminders(updated);
}

/**
 * Global update for all pending reminders.
 * Reprocesses templates for all reminders in "pending" status across all leads.
 */
export function refreshAllPendingReminders() {
  const allReminders = getReminders();
  const pending = allReminders.filter(r => r.status === "pending");
  if (pending.length === 0) return;

  const MIGRATED_KEY = "p21_reminders_v2_migrated";
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const leads = loadFromStorage<Lead[]>("p21_leads", []);
  const templates = getReminderTemplates();

  const updatedReminders = allReminders.map(r => {
    if (r.status !== "pending" || !r.templateId) return r;

    const lead = leads.find(l => l.id === r.leadId);
    if (!lead) return r;

    const tpl = templates.find(t => t.id === r.templateId);
    if (!tpl) return r;

    const leadMeetings = getMeetingsForLead(lead.id);
    const meeting = leadMeetings.find(m => m.id === r.meetingId) || leadMeetings[0];

    return {
      ...r,
      title: renderReminderTemplate(tpl.title, lead, meeting),
      message: renderReminderTemplate(tpl.message, lead, meeting),
    };
  });

  saveReminders(updatedReminders);
  localStorage.setItem(MIGRATED_KEY, "true");
}

function unitToMs(unit: ReminderUnit) {
  return unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
}

function computeScheduledFor(t: ReminderTemplate, anchorTime: Date): Date {
  const sign = t.direction === "before" ? -1 : 1;
  return new Date(anchorTime.getTime() + sign * t.offsetValue * unitToMs(t.offsetUnit));
}

// ---------- Trigger ----------
/**
 * Called when a lead's stage changes. Generates reminders from all enabled
 * templates configured for that stage. Cancels any prior pending reminders
 * for the same lead+stage to avoid duplicates.
 */
export function createRemindersForStageChange(lead: Lead, stage: string) {
  const templates = getReminderTemplates().filter(
    (t) => t.enabled && t.stage.toLowerCase() === stage.toLowerCase()
  );
  cancelPendingReminders(lead.id, [stage]);
  if (templates.length === 0) return [];

  const meeting = getMeetingsForLead(lead.id)[0];
  const now = new Date();
  const stageChangeTime = new Date();

  const out: Reminder[] = [];
  for (const t of templates) {
    let anchorTime: Date | null = null;
    if (t.anchor === "meeting") {
      if (!meeting) continue; // needs a meeting to compute
      anchorTime = new Date(`${meeting.date}T${meeting.time}:00`);
    } else {
      anchorTime = stageChangeTime;
    }
    let scheduled = computeScheduledFor(t, anchorTime);
    // If in the past (e.g. "48h before" set right before meeting), fire immediately.
    if (scheduled.getTime() < now.getTime()) scheduled = new Date(now.getTime() + 30_000);
    out.push({
      id: crypto.randomUUID(),
      leadId: lead.id,
      templateId: t.id,
      stage,
      meetingId: meeting?.id,
      kind: `tpl:${t.id}`,
      title: renderReminderTemplate(t.title, lead, meeting),
      message: renderReminderTemplate(t.message, lead, meeting),
      scheduledFor: scheduled.toISOString(),
      status: "pending",
      createdAt: now.toISOString(),
    });
  }
  upsertReminders(out);
  return out;
}

// ---------- Default seed ----------
function tpl(partial: Omit<ReminderTemplate, "id" | "createdAt" | "enabled">): ReminderTemplate {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function defaultSeedTemplates(): ReminderTemplate[] {
  return [
    tpl({
      stage: "Reunião Marcada",
      title: "Confirmação — [empresa]",
      message:
        "Olá [nome]! Confirmando nossa reunião no dia [data da reunião] às [hora da reunião]. " +
        "Qualquer dúvida antes, é só chamar aqui.",
      anchor: "meeting",
      direction: "before",
      offsetValue: 24,
      offsetUnit: "hours",
    }),
    tpl({
      stage: "Reunião Marcada",
      title: "Sala aberta — {empresa}",
      message: "[link]\n\nEstamos na sala aguardando. Qualquer dificuldade me chama.",
      anchor: "meeting",
      direction: "before",
      offsetValue: 10,
      offsetUnit: "minutes",
    }),
  ];
}
