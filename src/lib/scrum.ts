// ===== Scrum / Sprint store =====
// Tasks belong to a Sprint OR live in the backlog (sprintId === null)
// Scope: "agency" (internal/global) OR a specific clientId (lead.id)

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ScrumTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  storyPoints?: number;
  assignee?: string;
  sprintId: string | null; // null => backlog
  scope: "agency" | string; // "agency" or clientId (lead.id)
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  scope: "agency" | string;
  status: "planned" | "active" | "completed";
  createdAt: string;
}

import { uload as load, usave as save } from "./userStorage";

const TASKS_KEY = "p21_scrum_tasks";
const SPRINTS_KEY = "p21_scrum_sprints";

// Tasks
export function getTasks(): ScrumTask[] { return load<ScrumTask[]>(TASKS_KEY, []); }
export function saveTasks(t: ScrumTask[]) { save(TASKS_KEY, t); }

export function addTask(data: Omit<ScrumTask, "id" | "createdAt" | "updatedAt">): ScrumTask {
  const tasks = getTasks();
  const t: ScrumTask = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.push(t);
  saveTasks(tasks);
  return t;
}

export function updateTask(id: string, updates: Partial<ScrumTask>) {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const next = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() };
  if (updates.status === "done" && tasks[idx].status !== "done") next.completedAt = new Date().toISOString();
  if (updates.status && updates.status !== "done") next.completedAt = undefined;
  tasks[idx] = next;
  saveTasks(tasks);
}

export function deleteTask(id: string) {
  saveTasks(getTasks().filter((t) => t.id !== id));
}

// Sprints
export function getSprints(): Sprint[] { return load<Sprint[]>(SPRINTS_KEY, []); }
export function saveSprints(s: Sprint[]) { save(SPRINTS_KEY, s); }

export function addSprint(data: Omit<Sprint, "id" | "createdAt">): Sprint {
  const sprints = getSprints();
  const s: Sprint = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  sprints.push(s);
  saveSprints(sprints);
  return s;
}

export function updateSprint(id: string, updates: Partial<Sprint>) {
  const sprints = getSprints();
  const idx = sprints.findIndex((s) => s.id === id);
  if (idx === -1) return;
  sprints[idx] = { ...sprints[idx], ...updates };
  saveSprints(sprints);
}

export function deleteSprint(id: string, options: { moveTasksToBacklog?: boolean } = { moveTasksToBacklog: true }) {
  saveSprints(getSprints().filter((s) => s.id !== id));
  const tasks = getTasks();
  if (options.moveTasksToBacklog) {
    saveTasks(tasks.map((t) => (t.sprintId === id ? { ...t, sprintId: null } : t)));
  } else {
    saveTasks(tasks.filter((t) => t.sprintId !== id));
  }
}

// Burndown helpers
export function sprintBurndown(sprint: Sprint, tasks: ScrumTask[]): { date: string; remaining: number }[] {
  const sprintTasks = tasks.filter((t) => t.sprintId === sprint.id);
  const totalPoints = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const start = new Date(sprint.startDate + "T00:00:00");
  const end = new Date(sprint.endDate + "T23:59:59");
  const days: { date: string; remaining: number }[] = [];
  const dayMs = 86400000;
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs));
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * dayMs);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const completedPoints = sprintTasks
      .filter((t) => t.completedAt && new Date(t.completedAt) <= dayEnd)
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    days.push({
      date: d.toISOString().slice(5, 10),
      remaining: Math.max(0, totalPoints - completedPoints),
    });
  }
  return days;
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-400",
  high: "bg-orange-500/15 text-orange-400",
  urgent: "bg-destructive/15 text-destructive",
};
