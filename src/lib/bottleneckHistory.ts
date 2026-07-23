// Histórico persistente do Motor de Gargalos.
// Registra snapshots (não sobrescreve, não apaga automaticamente).
import { uload, usave } from "./userStorage";
import type { BottleneckSnapshot } from "./bottleneckEngine";

const KEY = "p21_bottleneck_history";
const MAX = 500;

export function getBottleneckHistory(): BottleneckSnapshot[] {
  return uload<BottleneckSnapshot[]>(KEY, []);
}

export function appendBottleneckSnapshot(snap: BottleneckSnapshot) {
  const all = getBottleneckHistory();
  // Evita duplicar snapshots idênticos consecutivos (mesmo período+gargalo no mesmo dia).
  const last = all[all.length - 1];
  const today = snap.timestamp.slice(0, 10);
  if (
    last &&
    last.periodKey === snap.periodKey &&
    last.stageKey === snap.stageKey &&
    last.actualPct === snap.actualPct &&
    last.timestamp.slice(0, 10) === today
  ) {
    return;
  }
  all.push(snap);
  if (all.length > MAX) all.splice(0, all.length - MAX);
  usave(KEY, all);
}
