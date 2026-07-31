// Exportação inteligente de leads (CRM e Discador/Matteline).
// Sem UI: apenas seleção, normalização, estatísticas e geração do .xlsx.

import * as XLSX from "xlsx";
import type { Lead } from "@/shared/services/store";
import { normalizePhoneBR } from "@/shared/services/userStorage";

export type ExportFormat = "crm" | "dialer";

export const ATTEMPT_FILTER_OPTIONS = [
  { value: "all", label: "Todas as tentativas", short: "" },
  { value: "0", label: "Novos Leads", short: "Novos" },
  { value: "1", label: "Tentativa 1", short: "T1" },
  { value: "2", label: "Tentativa 2", short: "T2" },
  { value: "3", label: "Tentativa 3", short: "T3" },
  { value: "4", label: "Tentativa 4", short: "T4" },
  { value: "5", label: "Tentativa 5", short: "T5" },
] as const;

export type AttemptFilter = (typeof ATTEMPT_FILTER_OPTIONS)[number]["value"];

export function attemptShort(v: AttemptFilter): string {
  return ATTEMPT_FILTER_OPTIONS.find((o) => o.value === v)?.short ?? "";
}

export function isValidExportPhone(raw?: string): boolean {
  if (!raw) return false;
  const p = normalizePhoneBR(raw);
  return /^\d+$/.test(p) && p.length >= 12 && p.length <= 15;
}

export function filterByAttempt(leads: Lead[], attempt: AttemptFilter): Lead[] {
  if (attempt === "all") return leads;
  const n = Number(attempt);
  return leads.filter((l) => (l.dialAttempts ?? 0) === n);
}

export interface DialerRow {
  Telefone: string;
  Nome: string;
  "E-mail": string;
  Empresa: string;
}

export interface ExportStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

/** Gera as linhas do discador já normalizadas, sem inválidos nem duplicados. */
export function buildDialerRows(leads: Lead[]): { rows: DialerRow[]; stats: ExportStats } {
  const seen = new Set<string>();
  const rows: DialerRow[] = [];
  let invalid = 0;
  let duplicates = 0;

  for (const l of leads) {
    const source = l.phoneNormalized || l.phone || l.whatsapp;
    if (l.phoneInvalid || !isValidExportPhone(source)) {
      invalid++;
      continue;
    }
    const phone = normalizePhoneBR(source);
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    const email = ((l as Lead & { email?: string }).email || "").trim();
    rows.push({
      Telefone: phone,
      Nome: (l.contact || "").trim(),
      "E-mail": email,
      Empresa: (l.company || "").trim(),
    });
  }

  return {
    rows,
    stats: { total: leads.length, valid: rows.length, invalid, duplicates },
  };
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "").trim();
  const base = clean.replace(/\.xlsx$/i, "");
  return `${base || "Exportação de Leads"}.xlsx`;
}

/** Nome automático: "Nicho - Cidade - Tentativa" (partes ausentes omitidas). */
export function buildExportFilename(opts: {
  niches: string[];
  cities: string[];
  attempt: AttemptFilter;
}): string {
  const parts: string[] = [];
  if (opts.niches.length > 0) parts.push(opts.niches.slice(0, 2).join(" / "));
  if (opts.cities.length > 0) parts.push(opts.cities.slice(0, 2).join(" / "));
  const short = attemptShort(opts.attempt);
  if (short) parts.push(short);
  if (parts.length === 0) return "Exportação de Leads";
  return parts.join(" - ");
}

export function downloadDialerXlsx(rows: DialerRow[], filename: string): void {
  const header = ["Telefone", "Nome", "E-mail", "Empresa"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  XLSX.writeFile(wb, sanitizeFilename(filename));
}

/** Exportação CRM — mantém exatamente o formato usado hoje no board. */
export function downloadCrmXlsx(leads: Lead[], filename: string): number {
  const rows = leads.map((l) => ({
    Empresa: l.company || "",
    Telefone: l.phone || "",
    Cidade: l.city || "",
    Nicho: l.niche || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Empresa", "Telefone", "Cidade", "Nicho"],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, sanitizeFilename(filename));
  return rows.length;
}
