// ============================================================
// Excel export engine — modular
// ------------------------------------------------------------
// Each page provides a "builder" that returns SheetSpec[]. The
// engine converts them to a formatted .xlsx (widths, freeze,
// autofilter, header row, number/currency/percent/date formats)
// and triggers a browser download.
//
// Nova aba futura? Basta acrescentar mais um SheetSpec — a
// arquitetura não muda.
// ============================================================

import * as XLSX from "xlsx";

// ---------- Períodos ----------
export type PeriodPreset =
  | "today" | "yesterday" | "last7" | "last30" | "last90"
  | "thisMonth" | "lastMonth" | "custom";

export interface DateRange { start: Date; end: Date; label: string; preset: PeriodPreset }

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  last90: "Últimos 90 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês anterior",
  custom: "Personalizado",
};

export function resolvePeriod(preset: PeriodPreset, customStart?: Date, customEnd?: Date): DateRange {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  switch (preset) {
    case "today": return { start, end, preset, label: PERIOD_LABELS.today };
    case "yesterday": {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      return { start, end, preset, label: PERIOD_LABELS.yesterday };
    }
    case "last7":  start.setDate(start.getDate() - 6);  return { start, end, preset, label: PERIOD_LABELS.last7 };
    case "last30": start.setDate(start.getDate() - 29); return { start, end, preset, label: PERIOD_LABELS.last30 };
    case "last90": start.setDate(start.getDate() - 89); return { start, end, preset, label: PERIOD_LABELS.last90 };
    case "thisMonth":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end, preset, label: PERIOD_LABELS.thisMonth };
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e, preset, label: PERIOD_LABELS.lastMonth };
    }
    case "custom": {
      const s = customStart ? new Date(customStart) : start;
      const e = customEnd ? new Date(customEnd) : end;
      s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
      return { start: s, end: e, preset, label: PERIOD_LABELS.custom };
    }
  }
}

export const inRange = (r: DateRange, iso: string): boolean => {
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= r.start.getTime() && t <= r.end.getTime();
};

// ---------- Padronização de texto ----------
export const clean = (s: string | undefined | null): string =>
  (s || "").replace(/\s+/g, " ").trim();
export const titleCase = (s: string | undefined | null): string => {
  const c = clean(s).toLowerCase();
  return c.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
};

// ---------- Tipos das colunas ----------
export type ColumnType = "text" | "int" | "decimal" | "percent" | "currency" | "date" | "datetime";

export interface ColumnDef {
  header: string;
  key: string;
  type?: ColumnType;
  width?: number; // largura aproximada em caracteres
}

export interface SheetSpec {
  name: string; // <= 31 chars por limitação Excel
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
}

export interface ExportMeta {
  crmName: string;
  moduleName: string;
  period: DateRange;
  user?: string;
}

// ---------- Formatação numérica ----------
const FMT: Record<Exclude<ColumnType, "text">, string> = {
  int: "#,##0;-#,##0;-",
  decimal: "#,##0.00;-#,##0.00;-",
  percent: "0.0%;-0.0%;-",
  currency: '"R$" #,##0.00;-"R$" #,##0.00;-',
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

function coerce(val: unknown, type: ColumnType): unknown {
  if (val === null || val === undefined || val === "") return "";
  if (type === "text") return String(val);
  if (type === "int" || type === "decimal" || type === "currency") {
    const n = typeof val === "number" ? val : Number(val);
    return isNaN(n) ? "" : n;
  }
  if (type === "percent") {
    // aceitar "0.5" como 50% ou "50" como 50%: mantemos convenção 0..1
    const n = typeof val === "number" ? val : Number(val);
    if (isNaN(n)) return "";
    return n > 1.5 ? n / 100 : n;
  }
  if (type === "date" || type === "datetime") {
    const d = val instanceof Date ? val : new Date(val as string);
    return isNaN(d.getTime()) ? "" : d;
  }
  return val;
}

function autoWidth(header: string, sample: unknown[]): number {
  let max = header.length;
  for (const v of sample.slice(0, 50)) {
    const s = v == null ? "" : String(v);
    if (s.length > max) max = s.length;
  }
  return Math.min(48, Math.max(10, max + 2));
}

// ---------- Construção da planilha ----------
function specToSheet(spec: SheetSpec): XLSX.WorkSheet {
  const headers = spec.columns.map((c) => c.header);
  const aoa: unknown[][] = [headers];
  for (const row of spec.rows) {
    aoa.push(spec.columns.map((c) => coerce(row[c.key], c.type || "text")));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Aplica formato de célula por coluna
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let c = 0; c < spec.columns.length; c++) {
    const col = spec.columns[c];
    if (!col.type || col.type === "text") continue;
    const numFmt = FMT[col.type];
    for (let r = 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      if (col.type === "date" || col.type === "datetime") {
        if (cell.v instanceof Date) { cell.t = "d"; cell.z = numFmt; }
      } else {
        if (typeof cell.v === "number") { cell.t = "n"; cell.z = numFmt; }
      }
    }
  }

  // Larguras automáticas
  ws["!cols"] = spec.columns.map((col, idx) => {
    const sample = spec.rows.slice(0, 50).map((r) => {
      const v = r[col.key];
      if (v instanceof Date) return v.toLocaleDateString("pt-BR");
      return v;
    });
    return { wch: col.width ?? autoWidth(col.header, sample) };
  });
  void range;

  // Congelar 1ª linha + autofilter
  ws["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  if (spec.rows.length > 0) {
    ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(spec.columns.length - 1)}1` };
  }

  return ws;
}

// ---------- Aba "Resumo Geral" padronizada ----------
function summarySpec(meta: ExportMeta, sheets: SheetSpec[]): SheetSpec {
  const rows: Array<Record<string, unknown>> = [
    { chave: "CRM", valor: meta.crmName },
    { chave: "Módulo", valor: meta.moduleName },
    { chave: "Data da Exportação", valor: new Date().toLocaleString("pt-BR") },
    { chave: "Período", valor: meta.period.label },
    { chave: "Data Inicial", valor: meta.period.start.toLocaleDateString("pt-BR") },
    { chave: "Data Final", valor: meta.period.end.toLocaleDateString("pt-BR") },
    { chave: "Usuário Responsável", valor: meta.user || "—" },
    { chave: "", valor: "" },
    { chave: "Aba", valor: "Registros" },
    ...sheets.map((s) => ({ chave: s.name, valor: s.rows.length })),
  ];
  return {
    name: "Resumo Geral",
    columns: [
      { header: "Chave", key: "chave", type: "text", width: 28 },
      { header: "Valor", key: "valor", type: "text", width: 44 },
    ],
    rows,
  };
}

// ---------- Nome do arquivo ----------
export function suggestedFilename(moduleSlug: string, period: DateRange): string {
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  if (period.preset === "custom") {
    return `Performance21_${moduleSlug}_${fmtDate(period.start)}_a_${fmtDate(period.end)}.xlsx`;
  }
  return `Performance21_${moduleSlug}_${fmtDate(new Date())}.xlsx`;
}

// ---------- API pública ----------
export function exportWorkbook(meta: ExportMeta, sheets: SheetSpec[], moduleSlug: string): void {
  const wb = XLSX.utils.book_new();
  const summary = summarySpec(meta, sheets);
  XLSX.utils.book_append_sheet(wb, specToSheet(summary), summary.name.slice(0, 31));
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, specToSheet(s), s.name.slice(0, 31));
  }
  const filename = suggestedFilename(moduleSlug, meta.period);
  XLSX.writeFile(wb, filename);
}
