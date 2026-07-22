// Estrutura de dados para Teste A/B de Scripts de prospecção.
// Esta etapa apenas registra qual script foi utilizado em cada ligação.
// Não altera métricas, dashboards ou cálculos existentes.

import { uload as loadFromStorage, usave as saveToStorage } from "./userStorage";

export const SCRIPT_OPTIONS = ["Script A", "Script B", "Script C", "Script D"] as const;
export type ScriptOption = (typeof SCRIPT_OPTIONS)[number];

const SELECTED_KEY = "p21_selected_script";
const LOGS_KEY = "p21_call_logs";

export interface CallLog {
  id: string;
  timestamp: string;
  scriptUsed: string;
  source: "pomodoro_header" | "call_note" | "session_form";
  leadId?: string;
}

export function getSelectedScript(): ScriptOption {
  return loadFromStorage<ScriptOption>(SELECTED_KEY, SCRIPT_OPTIONS[0]);
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
