// Intelligence — tipos do domínio (Refatoração 002).
export type IntelRole = "user" | "assistant" | "system";

export interface IntelConversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface IntelMessage {
  id: string;
  role: IntelRole;
  content: string;
  specialist?: string | null;
  citations?: unknown;
  model_used?: string | null;
  observability?: Record<string, any> | null;
  created_at: string;
}

export interface IntelRouterRequest {
  question: string;
  conversationId: string | null;
  specialistOverride?: string;
  history: { role: IntelRole; content: string }[];
  context: {
    page: string;
    leadContext: unknown;
    dashboardSnapshot: unknown;
  };
}

export interface IntelRouterResponse {
  content?: string;
  specialist?: string | null;
  citations?: unknown;
  model?: string | null;
  [key: string]: unknown;
}

export interface AttachmentAnalysisInput {
  attachment: { name: string; type: string; dataUrl: string };
  leadContext: string;
}
