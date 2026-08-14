// AI Core — contratos tipados (Projeto Phoenix, Fase 3A).
// Nenhuma regra de negócio aqui. Apenas contratos compartilhados entre
// Context Builder, Prompt Registry, Tool Registry e os especialistas.

export type SpecialistId = "diretor_comercial" | "consultor_leads" | "mentor_p21";

/** Intenções detectadas pelo roteador para otimização de contexto. */
export type IntelIntent =
  | "operacao_metricas"
  | "metodologia"
  | "objecoes"
  | "script_comunicacao"
  | "prescricao_oferta"
  | "lead_especifico"
  | "conselho_estrategia"
  | "outra";


/** Turno de conversa recebido do cliente (não confiável). */
export interface ConversationTurn {
  role: string;
  content: string;
}

/** Contexto operacional enviado pelo CRM para uma execução de IA. */
export interface CrmContext {
  page?: string;
  leadContext?: Record<string, unknown> | null;
  dashboardSnapshot?: Record<string, unknown> | null;
}

/** Bloco de contexto já sanitizado e pronto para composição do prompt. */
export interface ContextBlock {
  /** Identificador estável da origem (history, crm_snapshot, lead, knowledge, memory...). */
  source: string;
  /** Texto final já embrulhado como conteúdo não confiável, quando aplicável. */
  text: string;
  /** Metadados apenas para observabilidade — nunca conteúdo sensível. */
  meta?: Record<string, string | number | boolean | null>;
}

/** Resultado da montagem de contexto. */
export interface BuiltContext {
  blocks: ContextBlock[];
  /** Concatenação pronta para o prompt do usuário. */
  text: string;
  /** Tamanho aproximado do input relevante (para escolha de tier). */
  inputChars: number;
  /** Fontes efetivamente consultadas (observabilidade). */
  sources: string[];
  /** Metadados detalhados de observabilidade. */
  observability?: {
    intention: string;
    specialist: SpecialistId;
    contextSize: number;
    operationalData?: string[];
    knowledgeResult?: "found" | "none";
  };
}

/** Prompt versionado do registry. */
export interface PromptDefinition {
  id: string;
  version: number;
  /** Objetivo do prompt — documentação operacional, nunca enviado ao modelo. */
  purpose: string;
  /** Texto do system prompt já composto. */
  system: string;
  /** Ferramentas autorizadas (ids do Tool Registry). */
  tools?: string[];
}

/** Ferramenta declarada no Tool Registry. */
export interface ToolDefinition {
  id: string;
  purpose: string;
  /** Especialistas autorizados a usar esta ferramenta. */
  allowedFor: SpecialistId[];
  /** Exige o Authorization do usuário final (nunca service role). */
  requiresUserAuth: boolean;
}

export interface IntelRouterResponse {
  content?: string;
  specialist?: SpecialistId | null;
  citations?: any;
  model?: string | null;
  observability?: Record<string, any>;
  [key: string]: any;
}
