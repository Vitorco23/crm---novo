// ===== Daily tasks (header checklist) =====
// Tasks reset their "checked" state every day automatically.

export interface DailyTask {
  id: string;
  title: string;
  createdAt: string;
}

interface DailyChecks {
  date: string; // YYYY-MM-DD
  done: string[]; // task ids done today
}

import { uload as load, usave as save } from "@/shared/services/userStorage";

const TASKS_KEY = "p21_daily_tasks";
const CHECKS_KEY = "p21_daily_checks";

const today = () => new Date().toISOString().slice(0, 10);

export function getDailyTasks(): DailyTask[] {
  return load<DailyTask[]>(TASKS_KEY, []);
}
export function saveDailyTasks(t: DailyTask[]) { save(TASKS_KEY, t); }

export function addDailyTask(title: string): DailyTask {
  const t: DailyTask = { id: crypto.randomUUID(), title: title.trim(), createdAt: new Date().toISOString() };
  const all = getDailyTasks();
  all.push(t);
  saveDailyTasks(all);
  return t;
}

export function removeDailyTask(id: string) {
  saveDailyTasks(getDailyTasks().filter((t) => t.id !== id));
  const c = getTodayChecks();
  setTodayChecks(c.filter((x) => x !== id));
}

export function getTodayChecks(): string[] {
  const c = load<DailyChecks>(CHECKS_KEY, { date: today(), done: [] });
  if (c.date !== today()) {
    save(CHECKS_KEY, { date: today(), done: [] });
    return [];
  }
  return c.done;
}

export function setTodayChecks(done: string[]) {
  save(CHECKS_KEY, { date: today(), done });
}

export function toggleTodayCheck(id: string): boolean {
  const done = getTodayChecks();
  const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
  setTodayChecks(next);
  return next.includes(id);
}
