// Intelligence — ponto oficial de acesso a dados do domínio. Refatoração 002.
import * as Mutations from "./IntelMutations";

export const IntelligenceRepository = {
  analyzeAttachment: Mutations.analyzeAttachment,
  suggestICP: Mutations.suggestICP,
};

export type IntelligenceRepositoryType = typeof IntelligenceRepository;
