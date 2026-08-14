// Knowledge — tipos do domínio (Refatoração 002).
export interface KnowledgeDocument {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string | null;
  tags: string[];
  conteudo_markdown: string;
  versao: number;
  ativo: boolean;
  updated_at: string;
}

export interface KnowledgeDocumentPayload {
  titulo: string;
  categoria: string;
  descricao: string | null;
  tags: string[];
  conteudo_markdown: string;
  ativo: boolean;
  source_lead_id?: string | null;
}

export interface KnowledgeImportResult {
  suggestedTitle?: string;
  text?: string;
  [key: string]: unknown;
}
