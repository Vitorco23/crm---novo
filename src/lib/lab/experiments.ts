// Laboratório Comercial — CRUD de experimentos.
// Persistido em user_storage (sincroniza entre dispositivos).
// Constituição §5 (eventos), §13 (estado centralizado).

import { uload, usave } from "@/lib/userStorage";
import type { Experiment, ExperimentStatus } from "./types";

const KEY = "p21_lab_experiments";

export function getExperiments(): Experiment[] {
  return uload<Experiment[]>(KEY, []);
}
export function saveExperiments(items: Experiment[]) {
  usave(KEY, items);
}

export function addExperiment(input: Omit<Experiment, "id" | "createdAt" | "updatedAt">): Experiment {
  const now = new Date().toISOString();
  const exp: Experiment = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const all = getExperiments(); all.unshift(exp); saveExperiments(all);
  return exp;
}
export function updateExperiment(id: string, updates: Partial<Experiment>) {
  const all = getExperiments();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  saveExperiments(all);
}
export function setExperimentStatus(id: string, status: ExperimentStatus) {
  updateExperiment(id, { status });
}
export function deleteExperiment(id: string) {
  saveExperiments(getExperiments().filter((e) => e.id !== id));
}
