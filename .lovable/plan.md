# Plano de Melhoria: Modal de Importação e Sistema de ICP de 5 Estrelas

Este plano aborda a correção de usabilidade do modal de importação, a expansão do sistema de ICP para 5 estrelas em toda a plataforma e a inclusão do mapeamento de ICP durante a importação de leads.

## Alterações Técnicas

### 1. Correção do Modal de Importação (`ImportMappingDialog.tsx`)
- **Problema**: O modal não permite rolagem, escondendo campos e o botão de ação em telas menores ou com muitos campos.
- **Solução**: Ajustar o `DialogContent` para garantir que o rodapé e o cabeçalho fiquem fixos enquanto o conteúdo central (`ScrollArea`) ocupe o espaço disponível com rolagem interna funcional.

### 2. Expansão do ICP para 5 Estrelas
- **Shared Data (`store.ts`)**: Atualizar o tipo `ICPStars` de `1 | 2 | 3` para `1 | 2 | 3 | 4 | 5`.
- **Pipeline Kanban (`PipelineBoard.tsx`)**: Atualizar o componente `StarRating` para renderizar 5 estrelas em vez de 3.
- **Lista de Leads (`PipelineListView.tsx`)**: Atualizar a visualização em lista para mostrar 5 estrelas.
- **Drawer de Detalhes (`LeadDetailDrawer.tsx`)**: Atualizar o componente `StarRating` interno e a função `priorityLabel` para suportar a nova escala.
- **Edição em Massa (`BulkEditDialog.tsx`)**: Atualizar o seletor de ICP para 5 estrelas.

### 3. Importação de ICP (`ImportMappingDialog.tsx` & `PipelineBoard.tsx`)
- **Mapeamento**: Adicionar o campo "ICP (1-5 estrelas)" à lista `LEAD_FIELDS` no modal de importação.
- **Processamento**: Ajustar a lógica de criação de leads para converter o valor da coluna mapeada da planilha em um número de 1 a 5 (garantindo que seja um `ICPStars` válido).

## Detalhes Adicionais
- O ICP continuará sendo editável diretamente no card de detalhes do lead.
- A migração de dados existentes não é necessária, pois o tipo `number` já suporta a expansão, mas novos leads importados seguirão a nova regra.
