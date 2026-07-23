// Teste A/B de Scripts — lista editável pelo usuário.
// Persistida em userStorage (p21_scripts). Renomear propaga em call logs e sessions.

import { uload as loadFromStorage, usave as saveToStorage } from "./userStorage";

const SELECTED_KEY = "p21_selected_script";
const LOGS_KEY = "p21_call_logs";
const SCRIPTS_KEY = "p21_scripts";
const SESSIONS_KEY = "p21_sessions";

const DEFAULT_SCRIPTS = ["Script A", "Script B", "Script C", "Script D"];

// Mantido por compatibilidade com imports antigos — não é mais a fonte da verdade.
export const SCRIPT_OPTIONS = DEFAULT_SCRIPTS as readonly string[];
export type ScriptOption = string;

export interface CallLog {
  id: string;
  timestamp: string;
  scriptUsed: string;
  source: "pomodoro_header" | "call_note" | "session_form";
  leadId?: string;
}

function emitChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("p21:scripts-changed"));
  }
}

export function getScripts(): string[] {
  const list = loadFromStorage<string[]>(SCRIPTS_KEY, []);
  if (!Array.isArray(list) || list.length === 0) {
    saveToStorage(SCRIPTS_KEY, DEFAULT_SCRIPTS);
    return [...DEFAULT_SCRIPTS];
  }
  return list;
}

export function addScript(name: string): { ok: boolean; error?: string } {
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "Nome vazio" };
  const list = getScripts();
  if (list.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "Já existe um script com esse nome" };
  }
  saveToStorage(SCRIPTS_KEY, [...list, trimmed]);
  emitChanged();
  return { ok: true };
}

export function renameScript(oldName: string, newName: string): { ok: boolean; error?: string } {
  const trimmed = (newName || "").trim();
  if (!trimmed) return { ok: false, error: "Nome vazio" };
  const list = getScripts();
  const idx = list.findIndex((s) => s === oldName);
  if (idx < 0) return { ok: false, error: "Script não encontrado" };
  if (trimmed === oldName) return { ok: true };
  if (list.some((s, i) => i !== idx && s.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "Já existe um script com esse nome" };
  }
  const next = [...list];
  next[idx] = trimmed;
  saveToStorage(SCRIPTS_KEY, next);

  // Propaga em call logs
  const logs = loadFromStorage<CallLog[]>(LOGS_KEY, []);
  let logsChanged = false;
  const nextLogs = logs.map((l) => {
    if (l.scriptUsed === oldName) { logsChanged = true; return { ...l, scriptUsed: trimmed }; }
    return l;
  });
  if (logsChanged) saveToStorage(LOGS_KEY, nextLogs);

  // Propaga em sessions
  const sessions = loadFromStorage<any[]>(SESSIONS_KEY, []);
  let sessChanged = false;
  const nextSess = sessions.map((s) => {
    if (s?.scriptUsed === oldName) { sessChanged = true; return { ...s, scriptUsed: trimmed }; }
    return s;
  });
  if (sessChanged) saveToStorage(SESSIONS_KEY, nextSess);

  // Se o selecionado era o antigo, atualiza
  const selected = loadFromStorage<string>(SELECTED_KEY, "");
  if (selected === oldName) saveToStorage(SELECTED_KEY, trimmed);

  emitChanged();
  return { ok: true };
}

export function removeScript(name: string): { ok: boolean; error?: string } {
  const list = getScripts();
  if (list.length <= 1) return { ok: false, error: "Precisa existir ao menos 1 script" };
  if (!list.includes(name)) return { ok: false, error: "Script não encontrado" };
  const next = list.filter((s) => s !== name);
  saveToStorage(SCRIPTS_KEY, next);

  const selected = loadFromStorage<string>(SELECTED_KEY, "");
  if (selected === name) saveToStorage(SELECTED_KEY, next[0]);

  emitChanged();
  return { ok: true };
}

export function getSelectedScript(): ScriptOption {
  const list = getScripts();
  const sel = loadFromStorage<ScriptOption>(SELECTED_KEY, list[0]);
  return list.includes(sel) ? sel : list[0];
}

export function setSelectedScript(script: ScriptOption) {
  saveToStorage(SELECTED_KEY, script);
}

export function getCallLogs(): CallLog[] {
  return loadFromStorage<CallLog[]>(LOGS_KEY, []);
}

export function logCall(entry: Omit<CallLog, "id" | "timestamp">) {
  const logs = getCallLogs();
  logs.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  saveToStorage(LOGS_KEY, logs);
}
