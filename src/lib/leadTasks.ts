// ===== Lead Tasks store =====
// Tarefas vinculadas a um lead (ou avulsas quando leadId === null).
// Persistidas em user_storage (chave `p21_lead_tasks`) para sync cross-device.

import { uload, usave } from "./userStorage";
import { emit } from "./eventBus";

export type TaskPriority = "baixa" | "media" | "alta" | "urgente";
export type TaskStatus = "pendente" | "concluida";

export interface LeadTask {
  id: string;
  leadId: string | null;
  title: string;
  description?: string;
  dueAt: string;              // ISO datetime
  durationMin: number;        // default 30
  priority: TaskPriority;
  status: TaskStatus;
  googleEventId?: string;
  googleEventLink?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
}

const KEY = "p21_lead_tasks";

export function getTasks(): LeadTask[] {
  return uload<LeadTask[]>(KEY, []);
}

export function saveTasks(tasks: LeadTask[]) {
  usave<LeadTask[]>(KEY, tasks);
}

export function getTasksByLead(leadId: string): LeadTask[] {
  return getTasks()
    .filter((t) => t.leadId === leadId)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function getUpcomingTasks(rangeStart: Date, rangeEnd: Date): LeadTask[] {
  const s = rangeStart.getTime();
  const e = rangeEnd.getTime();
  return getTasks()
    .filter((t) => {
      const d = new Date(t.dueAt).getTime();
      return d >= s && d <= e;
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function getPendingTasksToday(): LeadTask[] {
  const now = new Date();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return getTasks().filter((t) =>
    t.status === "pendente" &&
    new Date(t.dueAt).getTime() <= end.getTime()
  );
}

export function addTask(data: Omit<LeadTask, "id" | "createdAt" | "updatedAt" | "status"> & { status?: TaskStatus }): LeadTask {
  const now = new Date().toISOString();
  const task: LeadTask = {
    ...data,
    status: data.status || "pendente",
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const all = getTasks();
  all.push(task);
  saveTasks(all);
  emit("TarefaCriada", task);
  return task;
}

export function updateTask(id: string, patch: Partial<LeadTask>) {
  const all = getTasks();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const prev = all[idx];
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  if (patch.status === "concluida" && prev.status !== "concluida") {
    next.completedAt = new Date().toISOString();
    emit("TarefaConcluida", next);
  }
  all[idx] = next;
  saveTasks(all);
  emit("TarefaAtualizada", next);
  return next;
}

export function deleteTask(id: string) {
  saveTasks(getTasks().filter((t) => t.id !== id));
}

export function completeTask(id: string) {
  return updateTask(id, { status: "concluida" });
}

export function reopenTask(id: string) {
  const all = getTasks();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], status: "pendente", completedAt: undefined, updatedAt: new Date().toISOString() };
  saveTasks(all);
  emit("TarefaAtualizada", all[idx]);
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  baixa: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  media: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  alta: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  urgente: "bg-red-500/15 text-red-400 border-red-500/30",
};

// Google Calendar colorId mapping
export const PRIORITY_GCAL_COLOR: Record<TaskPriority, string> = {
  baixa: "2",     // sage/green
  media: "5",     // banana/yellow
  alta: "6",      // tangerine/orange
  urgente: "11",  // tomato/red
};
