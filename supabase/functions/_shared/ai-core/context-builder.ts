// AI Core — Context Builder (Projeto Phoenix, Fase 3A).
// Responsável por montar o contexto mínimo necessário (histórico, CRM, lead,
// knowledge) já sanitizado. NÃO executa raciocínio de negócio nem renderiza
// respostas. Privilégio mínimo: cada bloco só entra se houver conteúdo.

import { sanitizeExternal, wrapUntrusted } from "../untrusted-input.ts";
import type { BuiltContext, ContextBlock, ConversationTurn, CrmContext } from "./types.ts";

export const CONTEXT_LIMITS = {
  historyTurns: 10,
  historyTurnChars: 1500,
  historyBlockChars: 8000,
  crmBlockChars: 12000,
  knowledgeBlockChars: 18000,
  knowledgeChunkChars: 3000,
  questionChars: 2000,
} as const;

/** Normaliza o histórico recebido do cliente (não confiável). */
export function normalizeHistory(history?: ConversationTurn[]): ConversationTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h.content === "string")
    .slice(-CONTEXT_LIMITS.historyTurns)
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content).slice(0, 2000),
    }));
}

export function buildHistoryBlock(history?: ConversationTurn[]): string {
  if (!history?.length) return "";
  const turns = history
    .slice(-CONTEXT_LIMITS.historyTurns)
    .map((h) => {
      const who = h.role === "assistant" ? "IA" : "Usuário";
      return `${who}: ${sanitizeExternal(String(h.content ?? ""), CONTEXT_LIMITS.historyTurnChars)}`;
    })
    .join("\n\n");
  return wrapUntrusted(turns, { maxChars: CONTEXT_LIMITS.historyBlockChars, label: "HISTÓRICO DA CONVERSA" }) + "\n\n";
}

export function buildCrmBlock(ctx: CrmContext): string {
  const parts: string[] = [];
  
  if (ctx.dashboardSnapshot && Object.keys(ctx.dashboardSnapshot).length) {
    const label = ctx.intent === "conselho_estrategia" ? "DADOS ESTRATÉGICOS E METAS" : "SNAPSHOT OPERACIONAL DO CRM";
    parts.push(wrapUntrusted(
      sanitizeExternal(JSON.stringify(ctx.dashboardSnapshot), CONTEXT_LIMITS.crmBlockChars),
      { maxChars: CONTEXT_LIMITS.crmBlockChars, label: `${label} (JSON)` },
    ));
  }
  
  if (ctx.leadContext && Object.keys(ctx.leadContext).length) {
    parts.push(wrapUntrusted(
      sanitizeExternal(JSON.stringify(ctx.leadContext), CONTEXT_LIMITS.crmBlockChars),
      { maxChars: CONTEXT_LIMITS.crmBlockChars, label: "LEAD ABERTO NO CRM (JSON)" },
    ));
  }
  
  if (!parts.length) return "";
  return parts.join("\n\n") + "\n\n";
}


export interface KnowledgeChunkLike {
  content: string;
  titulo: string;
  categoria: string;
  versao: number;
}

export function buildKnowledgeBlock(chunks: KnowledgeChunkLike[]): string {
  const text = chunks.length
    ? chunks
        .map((c, i) =>
          `[TRECHO ${i + 1}] Documento: "${c.titulo}" v${c.versao} · Categoria: ${c.categoria}\n${sanitizeExternal(c.content, CONTEXT_LIMITS.knowledgeChunkChars)}`,
        )
        .join("\n\n---\n\n")
    : "(nenhum trecho relevante encontrado na Base de Conhecimento — responda mesmo assim, usando o contexto do CRM e seu conhecimento comercial)";
  return wrapUntrusted(text, {
    maxChars: CONTEXT_LIMITS.knowledgeBlockChars,
    label: "KNOWLEDGE_CHUNKS (fonte complementar)",
  }) + "\n\n";
}

export function buildQuestionBlock(question: string, label = "PERGUNTA"): string {
  return wrapUntrusted(question, { maxChars: CONTEXT_LIMITS.questionChars, label });
}

/** Resumo não sensível do contexto — usado em classificação e observabilidade. */
export function summarizeContext(ctx: CrmContext) {
  return {
    page: ctx.page ?? null,
    hasLead: !!ctx.leadContext,
    hasDashboard: !!ctx.dashboardSnapshot,
  };
}

/**
 * Monta o contexto de uma execução de chat.
 * A ordem dos blocos é fixa e versionada: histórico → CRM → knowledge → extras.
 */
export function buildChatContext(params: {
  history?: ConversationTurn[];
  crm?: CrmContext;
  knowledgeChunks?: KnowledgeChunkLike[];
  extraBlocks?: ContextBlock[];
}): BuiltContext {
  const blocks: ContextBlock[] = [];

  const historyText = buildHistoryBlock(params.history);
  if (historyText) {
    blocks.push({ source: "history", text: historyText, meta: { turns: params.history?.length ?? 0 } });
  }

  if (params.crm) {
    const crmText = buildCrmBlock(params.crm);
    blocks.push({
      source: "crm",
      text: crmText,
      meta: summarizeContext(params.crm),
    });
  }

  if (params.knowledgeChunks) {
    blocks.push({
      source: "knowledge",
      text: buildKnowledgeBlock(params.knowledgeChunks),
      meta: { chunks: params.knowledgeChunks.length },
    });
  }

  for (const b of params.extraBlocks ?? []) blocks.push(b);

  const text = blocks.map((b) => b.text).join("");
  return {
    blocks,
    text,
    inputChars: text.length,
    sources: blocks.map((b) => b.source),
  };
}
