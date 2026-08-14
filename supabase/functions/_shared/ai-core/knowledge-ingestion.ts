// AI Core — Knowledge Ingestion Governance (Projeto Phoenix, Fase 3C+).
// Governança do lado de ESCRITA da Knowledge Platform: importação, publicação,
// indexação e reindexação. Espelha knowledge-governance.ts (lado de LEITURA).
//
// Camada puramente determinística: não faz I/O, não conhece Supabase e não
// altera contratos existentes. Responsabilidades:
//   • limites duros de conteúdo (bytes, caracteres, nº de chunks);
//   • validação estrutural do documento antes de indexar;
//   • sanitização/normalização do texto ingerido (controle, BOM, U+2028…);
//   • marcação (não bloqueio) de padrões de prompt-injection no conteúdo;
//   • observabilidade padronizada (knowledge_ingest / knowledge_index).

import { detectInjectionPatterns } from "../untrusted-input.ts";
import { normalizeCategory, KNOWLEDGE_LIMITS } from "./knowledge-governance.ts";

/** Limites duros de ingestão. Calibrados acima do maior documento real da KB. */
export const KNOWLEDGE_INGESTION_LIMITS = {
  /** Tamanho máximo do arquivo bruto aceito na importação. */
  maxFileBytes: 15 * 1024 * 1024,
  /** Caracteres máximos extraídos de um arquivo importado. */
  maxExtractedChars: 2_000_000,
  /** Caracteres máximos persistidos/indexados por documento. */
  maxDocumentChars: 2_000_000,
  /** Nº máximo de chunks gerados por documento. */
  maxChunks: 2000,
  chunkSize: 1200,
  chunkOverlap: 200,
  /** Tamanho mínimo útil de um chunk (evita ruído no índice). */
  minChunkChars: 20,
  maxTitleChars: 200,
  maxCategoryChars: KNOWLEDGE_LIMITS.maxCategoryChars,
  maxTagCount: 20,
  maxTagChars: 40,
  /** Nº máximo de arquivos por lote de importação. */
  maxBatchFiles: 50,
} as const;

export const KNOWLEDGE_EXTENSIONS = ["md", "markdown", "txt", "pdf", "docx", "pptx"] as const;
export type KnowledgeExtension = typeof KNOWLEDGE_EXTENSIONS[number];

// ------------------------------------------------------------------
// Normalização de texto ingerido
// ------------------------------------------------------------------

export interface NormalizedText {
  text: string;
  originalChars: number;
  chars: number;
  truncated: boolean;
}

/**
 * Normaliza texto vindo de arquivo/editor antes de persistir ou indexar.
 * Remove BOM, NUL, separadores de linha exóticos e caracteres de controle
 * (preservando \n e \t). NÃO reescreve o conteúdo semântico.
 */
export function normalizeIngestText(
  raw: unknown,
  maxChars: number = KNOWLEDGE_INGESTION_LIMITS.maxDocumentChars,
): NormalizedText {
  const src = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  const cleaned = src
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\u2028\u2029]/g, "\n")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  const truncated = cleaned.length > maxChars;
  return {
    text: truncated ? cleaned.slice(0, maxChars) : cleaned,
    originalChars: src.length,
    chars: truncated ? maxChars : cleaned.length,
    truncated,
  };
}

/** Normaliza o título: linha única, sem controle, com teto de tamanho. */
export function normalizeTitle(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  // deno-lint-ignore no-control-regex
  const clean = s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, KNOWLEDGE_INGESTION_LIMITS.maxTitleChars);
}

/** Normaliza tags: array curto de strings curtas, deduplicadas. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    // deno-lint-ignore no-control-regex
    const v = String(t ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, KNOWLEDGE_INGESTION_LIMITS.maxTagChars);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= KNOWLEDGE_INGESTION_LIMITS.maxTagCount) break;
  }
  return out;
}

export function normalizeExtension(filename: unknown): KnowledgeExtension | null {
  const name = typeof filename === "string" ? filename : "";
  const ext = (name.split(".").pop() || "").toLowerCase().trim();
  return (KNOWLEDGE_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as KnowledgeExtension)
    : null;
}

// ------------------------------------------------------------------
// Validação do documento antes de indexar
// ------------------------------------------------------------------

export interface IngestionDocumentInput {
  id?: string;
  titulo?: unknown;
  categoria?: unknown;
  conteudo_markdown?: unknown;
  tags?: unknown;
  ativo?: unknown;
}

export interface ValidatedIngestionDocument {
  titulo: string;
  categoria: string;
  tags: string[];
  content: NormalizedText;
  /** Documento publicado (ativo) — só documentos ativos entram na busca. */
  ativo: boolean;
}

export type IngestionValidation =
  | { ok: true; value: ValidatedIngestionDocument; warnings: string[] }
  | { ok: false; errors: string[] };

export function validateIngestionDocument(input: IngestionDocumentInput): IngestionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const titulo = normalizeTitle(input.titulo);
  if (!titulo) errors.push("titulo_required");

  const categoria = normalizeCategory(input.categoria) ?? "";
  if (!categoria) errors.push("categoria_required");

  const content = normalizeIngestText(input.conteudo_markdown);
  if (content.truncated) warnings.push("content_truncated");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    value: {
      titulo,
      categoria,
      tags: normalizeTags(input.tags),
      content,
      ativo: input.ativo === undefined ? true : Boolean(input.ativo),
    },
  };
}

// ------------------------------------------------------------------
// Chunking governado
// ------------------------------------------------------------------

export interface ChunkPlan {
  chunks: string[];
  dropped: number;
  capped: boolean;
  totalChars: number;
}

/**
 * Divide o markdown em chunks respeitando os limites duros.
 * Mesma estratégia de parágrafos usada desde a v1 — apenas governada:
 * teto de chunks, descarte de fragmentos irrelevantes e contabilidade.
 */
export function planChunks(
  text: string,
  limits: { chunkSize?: number; chunkOverlap?: number; maxChunks?: number; minChunkChars?: number } = {},
): ChunkPlan {
  const size = limits.chunkSize ?? KNOWLEDGE_INGESTION_LIMITS.chunkSize;
  const overlap = limits.chunkOverlap ?? KNOWLEDGE_INGESTION_LIMITS.chunkOverlap;
  const maxChunks = limits.maxChunks ?? KNOWLEDGE_INGESTION_LIMITS.maxChunks;
  const minChars = limits.minChunkChars ?? KNOWLEDGE_INGESTION_LIMITS.minChunkChars;

  const clean = (text ?? "").trim();
  if (!clean) return { chunks: [], dropped: 0, capped: false, totalChars: 0 };

  const raw: string[] = [];
  const paragraphs = clean.split(/\n{2,}/);
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length <= size) {
      buf = buf ? `${buf}\n\n${p}` : p;
    } else {
      if (buf) raw.push(buf);
      if (p.length <= size) {
        buf = p;
      } else {
        const step = Math.max(1, size - overlap);
        for (let i = 0; i < p.length; i += step) raw.push(p.slice(i, i + size));
        buf = "";
      }
    }
  }
  if (buf) raw.push(buf);

  const kept: string[] = [];
  let dropped = 0;
  for (const c of raw) {
    const t = c.trim();
    if (t.length < minChars) { dropped++; continue; }
    kept.push(t);
    if (kept.length >= maxChunks) break;
  }
  const capped = kept.length >= maxChunks && raw.length > kept.length + dropped;
  return {
    chunks: kept,
    dropped,
    capped,
    totalChars: kept.reduce((s, c) => s + c.length, 0),
  };
}

// ------------------------------------------------------------------
// Marcação de conteúdo suspeito (nunca bloqueia a ingestão)
// ------------------------------------------------------------------

export interface IngestionSafetyFlags {
  suspicious: boolean;
  patterns: string[];
}

/**
 * Marca padrões de prompt-injection no conteúdo ingerido.
 * A ingestão NÃO é bloqueada (documentos legítimos podem citar esses termos);
 * a proteção efetiva continua na leitura, via sanitizeChunk/wrapUntrusted.
 */
export function scanIngestContent(text: string): IngestionSafetyFlags {
  const scan = detectInjectionPatterns(text);
  return { suspicious: scan.suspicious, patterns: scan.matches };
}

/** Metadata padrão gravada em cada chunk (sem conteúdo sensível). */
export function buildChunkMetadata(params: {
  titulo: string;
  categoria: string;
  versao?: number;
  flags?: IngestionSafetyFlags;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    titulo: params.titulo,
    categoria: params.categoria,
  };
  if (Number.isFinite(params.versao)) meta.versao = Number(params.versao);
  if (params.flags?.suspicious) meta.injection_flags = params.flags.patterns;
  return meta;
}

// ------------------------------------------------------------------
// Observabilidade
// ------------------------------------------------------------------

/** Log padronizado de ingestão — nunca inclui o conteúdo do documento. */
export function logKnowledgeIngest(entry: {
  evt: "knowledge_import" | "knowledge_index";
  stage: string;
  documentId?: string;
  extension?: string | null;
  bytes?: number;
  chars?: number;
  originalChars?: number;
  truncated?: boolean;
  chunks?: number;
  droppedChunks?: number;
  capped?: boolean;
  ativo?: boolean;
  versao?: number;
  suspicious?: boolean;
  patterns?: string[];
  warnings?: string[];
  reason?: string;
  ms?: number;
}): void {
  console.log(JSON.stringify(entry));
}
