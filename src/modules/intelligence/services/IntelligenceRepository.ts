// Intelligence — ponto oficial de acesso a dados do domínio. Refatoração 002.
import * as Queries from "./IntelQueries";
import * as Mutations from "./IntelMutations";

export const IntelligenceRepository = {
  listConversations: Queries.selectConversations,
  listMessages: Queries.selectMessages,
  createConversation: Mutations.insertConversation,
  renameConversation: Mutations.renameConversation,
  deleteConversation: Mutations.deleteConversation,
  ask: Mutations.askIntelRouter,
  analyzeAttachment: Mutations.analyzeAttachment,
};

export type IntelligenceRepositoryType = typeof IntelligenceRepository;
