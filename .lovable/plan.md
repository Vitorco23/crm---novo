
## Objetivo

1. Expandir o widget de contadores no header do CRM de 3 para 5 botões: **Ligação, Conexão, Decisor, Mensagem, Reunião**.
2. Ao terminar o Pomodoro, o formulário deve vir pré-preenchido com os cliques feitos durante a sessão (já acontece com ligações e reuniões — passar a valer também para conexões e decisores).
3. Adicionar no Dashboard um **novo funil visual de outreach por Pomodoro** com as taxas de conversão entre as etapas (Ligações → Conexões → Decisores → Reuniões Marcadas), sem remover o funil atual de leads.

## O que muda

### 1. `src/contexts/PomodoroContext.tsx`
- Ampliar `TallyCounts` para incluir `connections` e `decisionMakers` (além de `calls`, `messages`, `meetings`).
- `DEFAULT_TALLY` passa a ter todos os 5 zerados.
- Nenhuma outra lógica é alterada — o `incrementTally` já é genérico.

### 2. `src/components/PomodoroHeaderWidget.tsx`
- Adicionar dois novos botões entre "Ligação" e "Mensagem": **Conexão** (ícone `Users`) e **Decisor** (ícone `UserCheck`).
- Ordem final: `Ligação | Conexão | Decisor | Mensagem | Reunião`.
- Mantém o mesmo visual/tamanho dos botões atuais.

### 3. `src/components/PomodoroSessionFormDialog.tsx`
- No `useEffect` que popula o formulário quando `showForm` abre, usar também `state.tally.connections` e `state.tally.decisionMakers` como valores iniciais (hoje esses dois começam em 0 mesmo se o usuário clicou nos botões — ou seja, o pré-preenchimento passa a valer para os 4 contadores numéricos, mantendo o campo de nicho como está).

### 4. `src/pages/Dashboard.tsx` — Novo funil de outreach
Adicionar um novo card **"Funil de Outreach (Pomodoro)"** ao lado (ou abaixo) do funil de leads existente. O funil atual de leads permanece intacto.

Etapas e cálculo (a partir de `filteredSessions` + `movementCalls` já usados na página):

```text
Ligações  ──►  Conexões  ──►  Decisores  ──►  Reuniões Marcadas
   100          50 (50%)       15 (30%)         3 (20%)
```

- **Ligações** = `sessionCalls + movementCalls` (já calculado)
- **Conexões** = `sessionConnections` (já calculado)
- **Decisores** = `sessionDecisionMakers` (já calculado)
- **Reuniões** = `totalSessionMeetings` (já calculado)
- Taxa de cada etapa = `etapa_atual / etapa_anterior * 100`, exibida ao lado da barra.
- Visual segue o mesmo estilo do funil atual (barras proporcionais horizontais, cores do design system verde/azul), para consistência.
- **Mensagens** não entra no funil (é canal paralelo, não sequência); fica apenas como contador no header.

## O que NÃO muda

- Nenhuma alteração no schema, no `store.ts` (`PomodoroSession` já tem os campos `connections` e `decisionMakers`), no fluxo de submit da sessão, no cálculo de Golden Hour, nas metas, no funil de leads, no pipeline, no financeiro ou em qualquer outro módulo.
- Nenhum dado existente é migrado ou apagado.
