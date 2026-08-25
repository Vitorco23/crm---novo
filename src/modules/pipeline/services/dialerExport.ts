// Exportação inteligente de leads (CRM e Discador/Matteline).
// Sem UI: apenas seleção, normalização, estatísticas e geração do .xlsx.

import * as XLSX from "xlsx";
import type { Lead } from "@/shared/services/store";
import { normalizePhoneBR } from "@/shared/services/userStorage";

export type ExportFormat = "crm" | "dialer";

export const ATTEMPT_FILTER_OPTIONS = [
  { value: "0", label: "Novos Leads", short: "Novos" },
  { value: "1", label: "Tentativa 1", short: "T1" },
  { value: "2", label: "Tentativa 2", short: "T2" },
  { value: "3", label: "Tentativa 3", short: "T3" },
  { value: "4", label: "Tentativa 4", short: "T4" },
  { value: "5", label: "Tentativa 5", short: "T5" },
  { value: "6", label: "Tentativa 6", short: "T6" },
  { value: "7", label: "Tentativa 7", short: "T7" },
  { value: "8", label: "Tentativa 8", short: "T8" },
  { value: "9", label: "Tentativa 9", short: "T9" },
  { value: "10", label: "Tentativa 10", short: "T10" },
  { value: "all", label: "Todas as tentativas", short: "Todas" },
] as const;

export type AttemptFilter = (typeof ATTEMPT_FILTER_OPTIONS)[number]["value"];

export function attemptShort(v: AttemptFilter): string {
  return ATTEMPT_FILTER_OPTIONS.find((o) => o.value === v)?.short ?? "";
}

/** Referência oficial: a coluna atual do pipeline (stage), não dialAttempts. */
export function stageAttemptNumber(stage?: string): number | null {
  const s = (stage || "").trim();
  if (!s) return null;
  if (/^novo\s+lead/i.test(s)) return 0;
  const m = s.match(/tentativa\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function isValidExportPhone(raw?: string): boolean {
  if (!raw) return false;
  const p = normalizePhoneBR(raw);
  return /^\d+$/.test(p) && p.length >= 12 && p.length <= 15;
}

export function filterByAttempt(leads: Lead[], attempt: AttemptFilter): Lead[] {
  if (attempt === "all") return leads;
  const n = Number(attempt);
  return leads.filter((l) => stageAttemptNumber(l.stage) === n);
}

export interface DialerRow {
  Telefone: string;
  Nome: string;
  "E-mail": string;
  Empresa: string;
  WhatsApp: string;
  Cidade: string;
  Nicho: string;
  Instagram: string;
  "Google Meu Negócio": string;
  Website: string;
  Decisor: string;
  Temperatura: string;
  Prioridade: string;
  Etapa: string;
  Notas: string;
  "Memória do Lead": string;
}

function leadMemory(l: Lead): string {
  const diagnosis = l.autoDiagnosis;
  const parts = [
    diagnosis?.summary,
    diagnosis?.attention ? `Objeção/atenção: ${diagnosis.attention}` : "",
    diagnosis?.next_action ? `Próxima ação: ${diagnosis.next_action}` : "",
    l.contact ? `Decisor: ${l.contact}` : "",
    l.notes ? `Notas: ${l.notes}` : "",
  ].map((v) => String(v || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return parts.join(" | ").slice(0, 1200);
}

function leadExportFields(l: Lead) {
  return {
    WhatsApp: l.whatsapp || "",
    Cidade: l.city || "",
    Nicho: l.niche || "",
    Instagram: l.instagramLink || "",
    "Google Meu Negócio": l.gmnLink || "",
    Website: l.website || "",
    Decisor: l.contact || "",
    Temperatura: l.temperature || l.autoDiagnosis?.temperature || "",
    Prioridade: l.icpStars ? `${l.icpStars} estrelas` : "",
    Etapa: l.stage || "",
    Notas: l.notes || "",
    "Memória do Lead": leadMemory(l),
  };
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
    const company = (l.company || "").trim();
    rows.push({
      Telefone: phone,
      // Matteline exige Nome preenchido e usa esse campo na discagem -> sempre a empresa.
      Nome: company,
      "E-mail": email,
      Empresa: company,
      ...leadExportFields(l),
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
  const header = ["Telefone", "Nome", "E-mail", "Empresa", "WhatsApp", "Cidade", "Nicho", "Instagram", "Google Meu Negócio", "Website", "Decisor", "Temperatura", "Prioridade", "Etapa", "Notas", "Memória do Lead"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [16, 24, 28, 32, 16, 18, 22, 32, 36, 32, 24, 14, 14, 20, 36, 80].map((wch) => ({ wch }));
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
    "E-mail": l.email || "",
    WhatsApp: l.whatsapp || "",
    Instagram: l.instagramLink || "",
    "Google Meu Negócio": l.gmnLink || "",
    Website: l.website || "",
    Decisor: l.contact || "",
    Temperatura: l.temperature || l.autoDiagnosis?.temperature || "",
    Prioridade: l.icpStars ? `${l.icpStars} estrelas` : "",
    Etapa: l.stage || "",
    Notas: l.notes || "",
    "Memória do Lead": leadMemory(l),
  }));
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Empresa", "Telefone", "Cidade", "Nicho", "E-mail", "WhatsApp", "Instagram", "Google Meu Negócio", "Website", "Decisor", "Temperatura", "Prioridade", "Etapa", "Notas", "Memória do Lead"],
  });
  ws["!cols"] = [32, 18, 18, 22, 28, 16, 32, 36, 32, 24, 14, 14, 20, 36, 80].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, sanitizeFilename(filename));
  return rows.length;
}
