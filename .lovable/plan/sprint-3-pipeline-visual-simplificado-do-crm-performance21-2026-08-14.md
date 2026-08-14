# Sprint 3: Pipeline Visual Simplificado do CRM Performance21

Objetivo: Tornar o Pipeline mais limpo, compacto e fácil de operar, reduzindo a poluição visual sem remover funcionalidades.

## Componentes a serem alterados

### 1. `PipelineBoard.tsx` (Componente Principal e Cabeçalho)
- **Cabeçalho**: Simplificar a estrutura. Organizar busca, filtros principais e filtros avançados em uma hierarquia clara. Mover ações secundárias (importação, remoção de duplicatas) para um menu discreto ou agrupar melhor.
- **Colunas do Kanban**: 
  - Reduzir a altura do cabeçalho da coluna.
  - Usar a cor da etapa de forma mais discreta (ex: uma barra lateral ou linha superior fina).
  - Exibir valor total e quantidade de forma compacta.
  - Melhorar visual do drag-and-drop.

### 2. `LeadCard` (Interno ao `PipelineBoard.tsx`)
- **Redesenho Completo**:
  - **Identificação**: Nome da empresa em destaque, contato secundário.
  - **Execução**: Próxima ação com ícone e prazo de forma compacta.
  - **Sinais**: Redução drástica de badges. Agrupar ícones de temperatura e IA.
  - **Interações**: Resumo da última interação em uma linha discreta.
  - **Badges**: Substituir badges de texto por ícones com tooltips ou indicadores sutis.
  - **Ações**: Manter as ações rápidas (WhatsApp, Ligação) em um bloco compacto ou visíveis ao hover (preservando acessibilidade mobile).

### 3. Filtros e Busca
- **Barra de Filtros**: Tornar mais compacta.
- **Indicador de Filtro Ativo**: Mais discreto.

## Detalhes Técnicos

- **Hierarquia Visual**: Usar as cores do Design System (#152039, #9ABD33, #F1FBFD) com variações sutis para profundidade.
- **Compactação**: Reduzir paddings e fontes mantendo a legibilidade.
- **Responsividade**: Garantir que as colunas se ajustem bem em diferentes resoluções (Full HD, Ultrawide, Mobile).
- **Tooltips**: Utilizar tooltips para informações secundárias que ocupavam espaço como badges.

## O que NÃO será alterado
- Regras de negócio, automações, nomes de etapas ou ordem.
- Dashboard, Modal do Lead ou outras páginas fora do pipeline.
- Banco de dados ou Supabase.

## Validação
- Build completo sem erros.
- Teste de drag-and-drop e persistência.
- Verificação visual em desktop, tablet e mobile.
