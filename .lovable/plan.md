# Por que está travando

Investigando o código, encontrei 5 gargalos que se somam quando você tem 2.000+ leads:

1. **Cada ação reescreve TODA a lista de leads.** Funções como `addLead`, `updateLead`, `deleteLead`, `moveLeadToStage` chamam `getLeads()` (parse do JSON inteiro) → modificam → `saveLeads()` (stringify do JSON inteiro). Com 2k leads, cada ação serializa ~vários MB.

2. **Cada save dispara um upload completo para a nuvem** (`cloudPush` em `userStorage.ts`). Sem debounce. Mover 1 lead = mandar a lista inteira para o servidor. Ações em rajada (importar, bulk move) = dezenas de uploads pesados em paralelo travando a aba.

3. **Bulk actions são O(n) de saves.** `handleBulkMove`, `handleBulkDelete`, `BulkEditDialog` e o importador iteram chamando `moveLeadToStage`/`updateLead`/`addLead` um por um. 100 leads selecionados = 100 reads + 100 writes + 100 uploads completos.

4. **`syncFromCloud` roda em todo evento de auth** (`TOKEN_REFRESHED`, foco da janela, etc.), baixando tudo de novo e reescrevendo o cache local.

5. **`niches`/`cities`/`pipelineLeads` recalculam a cada render** sem `useMemo`, varrendo todos os leads várias vezes por render.

# O que vou fazer

## 1. Reescrever camada de storage (`src/lib/userStorage.ts`)
- Adicionar **debounce de ~800ms** em `cloudPush` por chave: várias chamadas seguidas viram 1 upload com o último valor.
- Coalescer uploads em background (não bloqueia UI; já é fire-and-forget, mas o `JSON.stringify` agora roda só 1 vez por rajada).
- Limitar `syncFromCloud` para rodar **apenas no `SIGNED_IN` inicial** (e não em `TOKEN_REFRESHED`/refoco), evitando re-downloads desnecessários.

## 2. APIs em lote no `src/lib/store.ts`
Adicionar funções que fazem **1 read + 1 write** para N leads:
- `updateLeadsBatch(ids, updater)` — usado por `BulkEditDialog` e `handleBulkMove`.
- `deleteLeadsBatch(ids)` — usado por `handleBulkDelete`.
- `addLeadsBatch(leads, stage)` — usado pelo importador (substitui o loop de `addLead`).
- `moveLeadsToStageBatch(ids, stage)` — usa lote + dispara movement events de uma vez.

## 3. Atualizar componentes para usar as APIs em lote
- `PipelineBoard.tsx`: `handleBulkMove`, `handleBulkDelete`, `handleConfirmMapping` (importação) passam a chamar as funções batch.
- `BulkEditDialog.tsx`: troca o loop de `updateLead` por uma única chamada `updateLeadsBatch`.

## 4. Memoizar derivações pesadas em `PipelineBoard.tsx`
- `useMemo` em `allPipelineLeads`, `niches`, `cities`, `pipelineLeads`.
- `useMemo` para o agrupamento `leads por stage` (hoje filtra leads dentro do `stages.map`, gerando O(stages × leads) por render).
- `useCallback` nos handlers passados para `LeadCard` para evitar re-render de todos os cards quando muda 1 seleção.

## 5. Otimizar `dedupeLeads` (O(n²) hoje)
Trocar pelo uso de 3 `Map`s (telefone/empresa/gmn) para ficar O(n).

# Resultado esperado

- Adicionar/mover/editar 1 lead deixa de re-uploadar a lista inteira a cada clique.
- Bulk de 100 leads: 1 write local + 1 upload (em vez de 100+100).
- Importar 500 leads: 1 write + 1 upload no fim (em vez de 500+500).
- UI deixa de re-renderizar todos os cards a cada seleção.

# Fora do escopo (posso fazer depois se quiser)

- Migrar `p21_leads` de "1 linha JSON gigante" para "1 linha por lead" no `user_storage` (resolveria de vez o custo do payload na nuvem, mas exige migração de dados e mudanças maiores).
- Virtualização da lista de cards (só vira gargalo de render se uma coluna tiver centenas de cards visíveis).
