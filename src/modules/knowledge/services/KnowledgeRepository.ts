// Knowledge — ponto oficial de acesso a dados do domínio. Refatoração 002.
import * as Queries from "./KnowledgeQueries";
import * as Mutations from "./KnowledgeMutations";

export const KnowledgeRepository = {
  listDocuments: Queries.selectDocuments,
  chunkCounts: Queries.selectChunkCounts,
  createDocument: Mutations.insertDocument,
  updateDocument: Mutations.updateDocument,
  deleteDocument: Mutations.deleteDocument,
  indexDocument: Mutations.indexDocument,
  importFile: Mutations.importFile,
};

export type KnowledgeRepositoryType = typeof KnowledgeRepository;
