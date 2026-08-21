// Índice de busca textual do lead (Pesquisa Global por Conteúdo).
// Concentra TODO o texto armazenado dentro do lead em uma única string
// normalizada (minúscula, sem acento) usada pela pesquisa dos pipelines.
//
// Regras:
//   • Puro: nenhuma chamada de rede, nenhuma regra de negócio.
//   • Cache por lead, invalidado por assinatura simples de volume/atualização.

import type { Lead } from "@/shared/services/store";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function push(out: string[], v: unknown) {
  if (typeof v === "string" && v.trim()) out.push(v);
  else if (Array.isArray(v)) for (const i of v) push(out, i);
}

/** Concatena todo o conteúdo textual do lead. */
function collectText(lead: Lead): string {
  const parts: string[] = [];
  push(parts, [lead.company, lead.contact, lead.phone, lead.niche, lead.city, lead.notes, lead.tags]);
  push(parts, [lead.serviceType, lead.website, lead.whatsapp, lead.stage, lead.temperature]);

  for (const n of lead.callNotes ?? []) {
    push(parts, [n.text, n.scriptUsed, n.analysis?.markdown]);
    const d = n.analysis?.data;
    if (d) {
      push(parts, [d.resumoExecutivo, d.evolucaoLead, d.tendenciaJustificativa, d.objecoes]);
      for (const v of Object.values(d)) push(parts, v);
    }
  }

  for (const i of lead.interactions ?? []) {
    push(parts, [i.type, i.title, i.summary, i.sellerNotes]);
  }

  for (const a of lead.attachments ?? []) {
    push(parts, [a.name, a.aiAnalysis]);
  }

  const diag = lead.autoDiagnosis;
  if (diag) {
    push(parts, [diag.summary, diag.next_action, diag.attention, diag.updated_memory, diag.changes]);
  }
  for (const v of lead.diagnosisHistory ?? []) {
    for (const val of Object.values(v)) push(parts, val);
  }

  return norm(parts.join(" \n "));
}

const cache = new Map<string, { sig: string; text: string }>();

function signature(lead: Lead): string {
  return [
    lead.id,
    lead.stageChangedAt,
    (lead.notes || "").length,
    (lead.callNotes || []).length,
    (lead.interactions || []).length,
    (lead.attachments || []).length,
    (lead.diagnosisHistory || []).length,
    lead.autoDiagnosis?.generatedAt ?? "",
  ].join("|");
}

/** Texto pesquisável do lead (normalizado e memoizado). */
export function leadSearchText(lead: Lead): string {
  const sig = signature(lead);
  const hit = cache.get(lead.id);
  if (hit && hit.sig === sig) return hit.text;
  const text = collectText(lead);
  cache.set(lead.id, { sig, text });
  return text;
}

/**
 * Verifica se o lead corresponde à consulta.
 * Case/acento insensitive, busca parcial, todos os termos precisam existir.
 */
export function leadMatchesQuery(lead: Lead, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;

  const qDigits = q.replace(/\D+/g, "");
  if (qDigits.length >= 3) {
    const phoneDigits = `${lead.phone || ""}${lead.whatsapp || ""}${lead.phoneNormalized || ""}`.replace(/\D+/g, "");
    if (phoneDigits.includes(qDigits)) return true;
  }

  const text = leadSearchText(lead);
  return q.split(/\s+/).every((term) => text.includes(term));
}
