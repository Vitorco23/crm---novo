// ============================================================================
// MISSION STORE — itens operacionais da "Missão do Dia".
//
// Separa Planejamento (Tarefas / Scrum) de Operação Comercial (Missão do Dia).
// Não cria motores: apenas persiste o que o priorityEngine / missionPlanner
// já produziram e registra a execução diária.
//
// Persistência em user_storage (sync cross-device), chave `p21_mission_items`.
// ============================================================================

import { uload, usave } from "@/shared/services/userStorage";
import { emit } from "@/shared/services/eventBus";
import type { TaskPriority } from "@/modules/leads/services/leadTasks";

export type MissionEntryKind =
  | "calls"
  | "followups"
  | "meetings"
  | "prospect"
  | "script"
  | "lead";

export interface MissionEntry {
  id: string;
  /** dia (YYYY-MM-DD) a que a missão pertence */
  day: string;
  /** chave estável da prioridade que originou o item (dedupe por dia) */
  ref: string;
  kind: MissionEntryKind;
  title: string;
  reason: string;
  priority: TaskPriority;
  estimatedMinutes: number;
  bullets: string[];
  recommendedTime?: string;
  niche?: string;
  city?: string;
  company?: string;
  leadId?: string | null;
  status: "pendente" | "concluida";
  createdAt: string;
  completedAt?: string;
}

const KEY = "p21_mission_items";
const RESET_KEY = "p21_mission_reset_v1";

export const MISSION_UPDATED_EVENT = "p21:mission-updated";

export const missionDay = () => new Date().toISOString().slice(0, 10);

function notify() {
  try { window.dispatchEvent(new CustomEvent(MISSION_UPDATED_EVENT)); } catch { /* ignore */ }
}

export function getAllMissionEntries(): MissionEntry[] {
  return uload<MissionEntry[]>(KEY, []);
}

function saveAll(list: MissionEntry[]) {
  usave<MissionEntry[]>(KEY, list);
  notify();
}

export function getMissionEntries(day = missionDay()): MissionEntry[] {
  return getAllMissionEntries().filter((e) => e.day === day);
}

/** Mapa ref → item do dia (usado para o selo "Na Missão"). */
export function getMissionRefs(day = missionDay()): Map<string, MissionEntry> {
  return new Map(getMissionEntries(day).map((e) => [e.ref, e]));
}

export function addMissionEntry(
  data: Omit<MissionEntry, "id" | "day" | "status" | "createdAt"> & { day?: string },
): MissionEntry {
  const day = data.day || missionDay();
  const all = getAllMissionEntries();
  const existing = all.find((e) => e.day === day && e.ref === data.ref);
  if (existing) return existing;

  const entry: MissionEntry = {
    ...data,
    day,
    id: crypto.randomUUID(),
    status: "pendente",
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  saveAll(all);
  emit("TarefaCriada", entry);
  return entry;
}

export function completeMissionEntry(id: string) {
  const all = getAllMissionEntries();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const next: MissionEntry = {
    ...all[idx],
    status: "concluida",
    completedAt: new Date().toISOString(),
  };
  all[idx] = next;
  saveAll(all);
  emit("TarefaConcluida", next);
  return next;
}

export function reopenMissionEntry(id: string) {
  const all = getAllMissionEntries();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status: "pendente", completedAt: undefined };
  saveAll(all);
  return all[idx];
}

export function removeMissionEntry(id: string) {
  saveAll(getAllMissionEntries().filter((e) => e.id !== id));
}

/** Limpa somente a missão operacional do dia — nenhum dado comercial é tocado. */
export function resetMissionDay(day = missionDay()) {
  saveAll(getAllMissionEntries().filter((e) => e.day !== day));
}

export interface MissionProgress {
  total: number;
  done: number;
  pct: number;
  minutesLeft: number;
}

export function getMissionProgress(day = missionDay()): MissionProgress {
  const items = getMissionEntries(day);
  const done = items.filter((i) => i.status === "concluida").length;
  const minutesLeft = items
    .filter((i) => i.status === "pendente")
    .reduce((s, i) => s + (i.estimatedMinutes || 0), 0);
  return {
    total: items.length,
    done,
    pct: items.length ? Math.round((done / items.length) * 100) : 0,
    minutesLeft,
  };
}

/**
 * Reset único solicitado após os testes de hoje:
 * remove os itens da missão do dia atual e as tarefas de teste criadas
 * com origin = mission_center. Nenhum histórico comercial é alterado.
 */
export function runOneTimeMissionReset() {
  try {
    if (localStorage.getItem(RESET_KEY)) return;
  } catch { /* ignore */ }

  resetMissionDay();

  try {
    const raw = uload<Array<Record<string, unknown>>>("p21_lead_tasks", []);
    const today = missionDay();
    const cleaned = raw.filter(
      (t) => !(t.origin === "mission_center" && String(t.createdAt || "").slice(0, 10) === today),
    );
    if (cleaned.length !== raw.length) usave("p21_lead_tasks", cleaned);
  } catch { /* ignore */ }

  try { localStorage.setItem(RESET_KEY, new Date().toISOString()); } catch { /* ignore */ }
}
