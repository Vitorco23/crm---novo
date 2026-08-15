// Query Keys centralizadas — único ponto oficial de chaves do TanStack Query.
// Refatoração 002 (Data Layer). Não usar strings soltas nos componentes.

export const queryKeys = {
  dashboard: () => ["dashboard"] as const,
  pipeline: (pipeline?: string) => (pipeline ? (["pipeline", pipeline] as const) : (["pipeline"] as const)),
  leads: () => ["leads"] as const,
  leadDetail: (leadId: string) => ["lead-detail", leadId] as const,
  agenda: () => ["agenda"] as const,
  calendar: (startISO: string, endISO: string) => ["calendar", startISO, endISO] as const,
  memory: () => ["memory"] as const,
  directorAI: () => ["director-ai"] as const,
  diagnosis: (leadId: string) => ["diagnosis", leadId] as const,
  intelConversations: () => ["intel", "conversations"] as const,
  intelMessages: (conversationId: string) => ["intel", "messages", conversationId] as const,
  scripts: () => ["scripts"] as const,
  integrations: () => ["integrations"] as const,
  systemHealth: () => ["system-health"] as const,
} as const;

export type QueryKeyFactory = typeof queryKeys;
