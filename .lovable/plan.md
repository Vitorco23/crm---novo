# Segunda reunião ao entrar em "Reunião Realizada"

Quando um lead entra na etapa **Reunião Realizada** (pipeline Oportunidades), abrir automaticamente o diálogo de agendamento pré-configurado para uma segunda reunião ("Reunião de Alinhamento"), que também sincroniza com o Google Agenda.

## Comportamento

- Gatilho: qualquer movimentação de um lead para a etapa `Reunião Realizada` no pipeline Oportunidades — via drag-and-drop no Kanban, via mudança de etapa no List View, ou via seletor "Mover lead para..." no Lead Detail Drawer.
- Ao mover, abre o `ScheduleMeetingDialog` em um novo modo `"alinhamento"`:
  - Título do evento: `Reunião de Alinhamento: {empresa} - P21` (ao invés de "Reunião de diagnóstico - {empresa}").
  - Descrição padrão: "Apresentação do planejamento / projeto P21" + dados do lead.
  - Canal padrão: Google Meet, sincronização com Google Agenda ligada.
  - Botão de confirmação: "Confirmar Reunião de Alinhamento".
  - Botão secundário "Pular" para o usuário fechar sem agendar (o lead permanece em Reunião Realizada normalmente).
- A reunião é salva como um novo `Meeting` para o lead (não substitui a de diagnóstico) e aparece no histórico do drawer e no bloco "Próximas Reuniões" do Dashboard.
- Não abrir o diálogo se o lead já tem uma reunião com título começando com "Reunião de Alinhamento" (evita reabrir toda vez que o lead volta para essa etapa).

## Alterações técnicas

- `src/components/ScheduleMeetingDialog.tsx`
  - Aceitar prop `kind?: "diagnostico" | "alinhamento"` (default `"diagnostico"`).
  - Usar o `kind` para: título do evento enviado ao Google, texto do header do diálogo, texto do botão de confirmar e descrição padrão.
  - Não mover o lead para "Reunião Marcada" quando `kind === "alinhamento"` (o lead já está em Reunião Realizada) — pular a chamada que faz o auto-transfer no `scheduleMeeting`, ou adicionar um flag em `scheduleMeeting` para desabilitar o auto-move.
- `src/lib/store.ts`
  - Adicionar parâmetro opcional em `scheduleMeeting` (`{ skipAutoMove?: boolean }`) para reunião de alinhamento não mudar a etapa.
- `src/components/PipelineBoard.tsx`
  - Após qualquer movimentação para `Reunião Realizada` no pipeline `oportunidades`, verificar se o lead já tem meeting de alinhamento; se não, setar estado `alignmentLead` e abrir o `ScheduleMeetingDialog` com `kind="alinhamento"`.
- `src/components/PipelineListView.tsx`
  - Mesmo gatilho quando o usuário troca a etapa via o select inline.
- `src/components/LeadDetailDrawer.tsx`
  - Mesmo gatilho quando o usuário usa "Mover lead para..." para `Reunião Realizada`.

Componente reutilizado é o mesmo `ScheduleMeetingDialog`, só com título/descrição/label alterados pelo `kind`.
