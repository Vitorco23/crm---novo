# Plano de Implementação: Sprint 2 — Dashboard Operacional Simplificado

A Sprint 2 aplicará a fundação visual da Sprint 1 na página inicial, transformando-a em um cockpit comercial focado em execução diária.

## Análise do Dashboard Atual
- **Componentes:** OperationalPanel, PipelinePanel, StrategicIntelligencePanel, FinancialHealthRow, BottleneckCard, EstimatedActivityCard, PomodoroRanking.
- **Métricas:** Ligações, Conexões, Decisores, Reuniões, Eficiência (ligações/reunião), Receita, Pipeline em negociação, Conversão de funil.
- **Filtros:** Período (Hoje, Semana, Mês, Custom).
- **Ações:** Exportação Excel, Navegação para Leads.

## Alterações Propostas

### 1. Estrutura Global
- Simplificar `src/modules/dashboard/pages/Dashboard.tsx` para seguir a hierarquia de quatro níveis.
- Remover descrições longas e botões redundantes do cabeçalho.
- Garantir responsividade (grid 12 colunas no desktop, stack no mobile).

### 2. Bloco Principal: Prioridades do Dia
- Criar `src/modules/dashboard/components/DailyPriorities.tsx`.
- Exibir lista compacta baseada em `computePriorities()` do `priorityEngine.ts`.
- Focar em: Follow-ups atrasados, Reuniões de hoje e Leads Críticos.
- Atalhos para abrir o LeadDetailDrawer.

### 3. Indicadores Essenciais
- Reorganizar `MetricCard` para ser mais discreto e compacto.
- Selecionar 4-6 KPIs: Atividades do dia (ledger), Reuniões (agenda), Conversão (funil), Valor em negociação (financeiro).

### 4. Visão Resumida e Análises Adicionais
- Consolidar Funil, Agenda e Saúde Financeira em blocos de menor peso visual.
- Mover `PomodoroRanking`, `EstimatedActivityCard` e `StrategicIntelligencePanel` para uma seção secundária "Análises Adicionais" (recolhível).

### 5. Refinamento Visual
- Aplicar cores: `#152039` (Blue), `#9ABD33` (Green), `#F1FBFD` (Bg Light).
- Remover bordas excessivas e sombras.
- Padronizar estados de loading (Skeleton) e vazio.

## Detalhes Técnicos
- Utilizar `useMemo` para evitar re-cálculos desnecessários das prioridades.
- Manter integração com `userStorage` e `eventBus` para tempo real.
- Nenhuma alteração no banco de dados ou regras de negócio.
