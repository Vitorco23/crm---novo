# Plano: Funil Outbound Completo no Dashboard

Reestruturação do componente de funil no Dashboard para refletir a prospecção ativa (Outbound) baseada exclusivamente em registros de Pomodoro.

## Alterações Visuais e de Interface

### Dashboard (Visão Executiva)
- Renomear o bloco "CONVERSÃO OUTREACH" para **"FUNIL OUTBOUND"**.
- Atualizar as etapas para:
    1.  **Ligações** (base 100% da barra visual)
    2.  **Conexões** (taxa vs. Ligações)
    3.  **Decisores** (taxa vs. Conexões)
    4.  **R1 agendadas** (taxa vs. Decisores) — *utilizando o campo `meetings` das sessões*.
- Implementar barras proporcionais ao volume inicial de Ligações.
- Exibir percentuais de conversão entre etapas consecutivas (arredondado para 1 casa decimal).
- Adicionar bloco inferior **"Decisores sem R1 no período"** com cálculo `max(0, decisores - meetings)` e tooltip de ressalva sobre contatos repetidos.
- Adicionar indicador **"Principal gargalo do período"** baseado na menor conversão válida.
- Adicionar indicador **"Ritmo da meta"** se houver meta de R1/Reuniões configurada.
- Adicionar comparação discreta com o período anterior (seta de variação + % + tooltip de período).

## Lógica e Dados

### Fonte de Dados
- Utilizar exclusivamente `p21_sessions` do storage.
- Ignorar `activityLedger`, movimentações de cards ou registros automáticos da Matteline para este componente.
- Respeitar filtros de período: Hoje (vs ontem), Semana (vs semana anterior), Mês (vs mês anterior), Personalizado (vs período anterior equivalente).

### Exportação Excel
- Adicionar aba "Funil Outbound" no arquivo gerado pelo Dashboard.
- Incluir colunas: Período, Ligações, Conexões, Taxa de conexão, Decisores, Taxa de acesso ao decisor, R1 agendadas, Taxa de agendamento, Decisores sem R1 e Gargalo.

## Detalhes Técnicos
- Local das mudanças: `src/modules/dashboard/pages/Dashboard.tsx` (componente `ActivityFunnelCard`).
- Atualização do `buildDashboardSheets` em `src/modules/pipeline/services/exportBuilders.ts`.
- Manter diff zero em: `activityLedger.ts`, fluxos Matteline, n8n e infraestrutura Supabase.
- Garantir que "—" seja exibido quando não houver denominador.

## Testes e Validação
- Validar troca de títulos e nomes das etapas.
- Verificar cálculos de taxas e comportamento com denominador zero.
- Confirmar que a fonte de dados é estritamente o Pomodoro.
- Testar visualização em desktop e mobile.
- Validar exportação Excel com os novos campos.
