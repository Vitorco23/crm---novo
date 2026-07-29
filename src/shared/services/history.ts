// ===== Histórico cronológico do lead =====
// Alimentado automaticamente pelo eventWiring — não requer chamadas manuais
// nos componentes existentes.
import { uload, usave } from "@/shared/services/userStorage";

export interface HistoryEntry {
  id: string;
  leadId?: string;
  type: string;
  label: string;
  detail?: string;
  at: string; // ISO
}

const KEY = "p21_history";
const MAX_ENTRIES = 5000;

export function getHistory(): HistoryEntry[] {
  return uload<HistoryEntry[]>(KEY, []);
}

export function getHistoryForLead(leadId: string): HistoryEntry[] {
  return getHistory()
    .filter((h) => h.leadId === leadId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function appendHistory(entry: Omit<HistoryEntry, "id" | "at"> & { at?: string }) {
  const all = getHistory();
  all.push({
    ...entry,
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
  });
  // ring buffer para não crescer indefinidamente
  const trimmed = all.length > MAX_ENTRIES ? all.slice(all.length - MAX_ENTRIES) : all;
  usave(KEY, trimmed);
}
