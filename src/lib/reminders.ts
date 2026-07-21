// User-configurable reminder templates per pipeline stage.
// When a lead moves to a stage that has templates, reminders are generated
// according to each template's offset (relative to stage change OR meeting time).
import { uload as loadFromStorage, usave as saveToStorage } from "./userStorage";
import type { Lead, Meeting } from "./store";
import { getMeetingsForLead } from "./store";

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
  message: string; // supports placeholders {nome} {empresa} {data} {hora} {link} {protocolo}
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
  // Seed with a few sensible defaults so the UI isn't empty on first use.
  const seed = defaultSeedTemplates();
  saveToStorage(TEMPLATES_KEY, seed);
  return seed;
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

function renderTemplate(text: string, lead: Lead, meeting?: Meeting) {
  const nome = firstName(meeting?.contactName || lead.contact || lead.company);
  const empresa = lead.company;
  const meetingAt = meeting ? new Date(`${meeting.date}T${meeting.time}:00`) : null;
  const map: Record<string, string> = {
    "{nome}": nome,
    "{empresa}": empresa,
    "{data}": meetingAt ? fmtDate(meetingAt) : "",
    "{hora}": meetingAt ? fmtTime(meetingAt) : "",
    "{link}": meeting?.meetLink || meeting?.link || "",
    "{protocolo}": protocolFor(lead),
  };
  return text.replace(/\{(nome|empresa|data|hora|link|protocolo)\}/g, (m) => map[m] ?? "");
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
      title: renderTemplate(t.title, lead, meeting),
      message: renderTemplate(t.message, lead, meeting),
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
      title: "Confirmação — {empresa}",
      message:
        "Olá {nome}! Confirmando nossa reunião no dia {data} às {hora}. " +
        "Qualquer dúvida antes, é só chamar aqui.",
      anchor: "meeting",
      direction: "before",
      offsetValue: 24,
      offsetUnit: "hours",
    }),
    tpl({
      stage: "Reunião Marcada",
      title: "Sala aberta — {empresa}",
      message: "{link}\n\nEstamos na sala aguardando. Qualquer dificuldade me chama.",
      anchor: "meeting",
      direction: "before",
      offsetValue: 10,
      offsetUnit: "minutes",
    }),
  ];
}
