# Plan - Fix Pipeline Disappearances and Tag Filtering

## Problem 1: Leads vanish when marked "sem interesse" or "contato inválido"
The pipeline stages "Não Quer" and "Sem contato" were previously removed from the default stage lists, but `ConcluirTentativaDialog.tsx` was still moving leads to these non-existent stages. Since the pipeline board only displays leads that belong to a stage in its current configuration, these leads would "vanish".

## Problem 2: Tag filter on the pipeline board does nothing
The "Tags" filter UI was implemented in `PipelineBoard.tsx`, but the actual filtering logic in the `useMemo` hook was missing the tag check, causing the filter to have no effect on the visible cards.

## Proposed Changes

### Lead Management & Navigation
- **`ConcluirTentativaDialog.tsx`**:
    - Update "Sem Interesse" logic to move leads to the "Perdido" stage (which exists in the Opportunities pipeline) instead of the non-existent "Não Quer".
    - Update "Contato Inválido" logic to move leads to "Tentativas Concluídas" (the final stage of the Cold Call pipeline) instead of the non-existent "Sem contato".
    - This ensures leads remain visible in the CRM and can be recovered or audited.

### Pipeline Board
- **`PipelineBoard.tsx`**:
    - Update the `pipelineLeads` filtering logic to include a check for the selected tags.
    - Update the `pipelineLeads` dependency array to include `filterTags`.
    - Fix the "Clear Filters" button to also reset the selected tags.

## Technical Details
- Using `l.tags.some(t => filterTags.includes(t))` for tag filtering to support multiple tag selection (OR logic).
- Ensuring compatibility with existing lead data by defaulting to the "Perdido" stage for lost leads.
