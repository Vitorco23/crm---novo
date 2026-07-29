// Knowledge — hooks de leitura/escrita via TanStack Query. Refatoração 002.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/services/queryKeys";
import { KnowledgeRepository } from "../services/KnowledgeRepository";
import type { KnowledgeDocument } from "../services/KnowledgeTypes";

export function useKnowledgeDocuments() {
  return useQuery<KnowledgeDocument[]>({
    queryKey: queryKeys.knowledge(),
    queryFn: KnowledgeRepository.listDocuments,
    staleTime: 30_000,
  });
}

export function useKnowledgeChunkCounts(documentIds: string[]) {
  return useQuery<Record<string, number>>({
    queryKey: queryKeys.knowledgeChunkCounts(documentIds),
    queryFn: () => KnowledgeRepository.chunkCounts(documentIds),
    enabled: documentIds.length > 0,
    staleTime: 30_000,
  });
}

export function useInvalidateKnowledge() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.knowledge() });
}

export function useDeleteKnowledgeDocument() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (id: string) => KnowledgeRepository.deleteDocument(id),
    onSuccess: invalidate,
  });
}
