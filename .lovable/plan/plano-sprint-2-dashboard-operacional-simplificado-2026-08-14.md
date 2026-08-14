# Plano: Sprint 2 — Dashboard Operacional Simplificado

Implementação da Sprint 2 com foco em transformar o Dashboard em um cockpit comercial orientado à execução diária, respeitando a nova fundação visual.

## 1. Estrutura Global
- Reorganização do layout em 4 níveis de prioridade.
- Grid responsivo (8 colunas para prioridades, 4 colunas para indicadores em desktop).
- Seção analítica secundária recolhível para reduzir ruído visual.

## 2. Cabeçalho da Página
- Título "Visão Geral" limpo com badge de período.
- Filtros de período (Hoje, Semana, Mês, Personalizado) em grupo de botões discreto.
- Botão de exportação XLSX integrado.

## 3. Prioridades do Dia (Principal)
- Integração com `priorityEngine.ts` para exibir os 10 leads mais urgentes.
- Lista operacional compacta com ícones de ação (Telefone, WhatsApp, Reunião).
- Exibição de motivo da prioridade e tempo estimado.
- Abertura direta do `LeadDetailDrawer` ao clicar no item.

## 4. Indicadores Essenciais
- Grid de 4 KPIs principais: Ligações (via `activityLedger`), Reuniões, Valor em Negociação e Leads Ativos.
- Cards simplificados com ícones e variações semânticas.

## 5. Visão Resumida e Agenda
- `PipelineCompactCard`: Distribuição do funil em barras horizontais.
- `ActivityFunnelCard`: Conversão de outreach (Ligações -> Conexões -> Reuniões).
- `FinancialHealthRow`: Integrado abaixo do bloco principal.

## 6. Análises Adicionais (Recolhível)
- `StrategicIntelligencePanel`: Insights da IA e o que mudou.
- `OperationalAnalysis`: Visão detalhada de performance.
- `EstimatedActivityPanel`: Gráficos de atividade estimada.
- `PomodoroRankingPanel`: Ranking de foco.

## Detalhes Técnicos
- Utilização de `useMemo` para evitar re-renders pesados nos filtros.
- Aplicação dos tokens de cor definidos na Sprint 1 (#152039, #9ABD33, #F1FBFD).
- Resgate de componentes que foram acidentalmente omitidos na refatoração inicial do arquivo `Dashboard.tsx`.
