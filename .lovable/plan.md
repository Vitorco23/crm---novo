
# Lembretes Automáticos + Notificações Chrome

Adicionar um sistema de lembretes que dispara automaticamente para cada lead movido para **Oportunidades → Reunião Marcada**, com notificações no Chrome e uma central de lembretes no CRM.

## O que será criado

### 1. Novo módulo "Lembretes"
- Nova página `Lembretes` no menu lateral (ícone sino) mostrando todos os lembretes agendados, pendentes e enviados.
- Cada lembrete tem: lead vinculado, tipo, data/hora de disparo, mensagem já preenchida com os dados do lead, status (`pending`, `sent`, `dismissed`), botão "Copiar texto" e "Marcar como enviado".
- Filtros: hoje, próximas 48h, atrasados, todos.

### 2. Notificações do Chrome
- Botão "Ativar notificações" na página Lembretes e no header (pede permissão via `Notification.requestPermission()`).
- Quando um lembrete vence, dispara uma `Notification` nativa com título ("Lembrete: [Empresa]"), o texto e ação para abrir a tela de Lembretes.
- Verificação a cada 60s enquanto a aba estiver aberta (sem service worker — funciona apenas com CRM aberto, comportamento que aviso claramente ao usuário).

### 3. Geração automática dos lembretes ao marcar reunião
Quando um lead entra em **Reunião Marcada** (via `ScheduleMeetingDialog`, `Nova Oportunidade` ou drag para a coluna), geramos os lembretes abaixo com placeholders já preenchidos (Nome, Empresa, Data, Hora, Protocolo = 6 chars do ID do lead em maiúsculo).

| # | Momento | Regra | Nome interno |
|---|---------|-------|--------------|
| 1 | Imediato | Sempre | `reserva-confirmada` |
| 2 | 48h antes | Só se reunião for daqui > 48h | `boas-vindas` + `autoridade` (2 msgs) |
| 3 | 24h antes | Só se reunião for daqui > 24h | `reforco-valor` (opcional) |
| 4 | 24h antes | Sempre (se > 24h) | `objetivos-obrigatoria` |
| 5 | Noite anterior (20h) OU dia da reunião 9h | Se reunião pela manhã (<12h) → noite anterior. Se pela tarde (>=12h) → 9h do dia | `complemento-noite-manha` |
| 6 | 2h antes | Sempre | `check-2h` (4 opções: texto/áudio/vídeo/ligação) |
| 7 | 30min antes | Sempre | `check-30min` (texto + áudio) |
| 8 | 10min antes | Sempre | `link-sala` |

Se a reunião estiver a menos do tempo mínimo de cada regra, aquele lembrete simplesmente não é criado (o pedido diz "ignore esse aviso" quando falta pouco tempo).

### 9. Lembretes de No Show
Quando o lead é movido para uma etapa chamada **No Show** no pipeline Oportunidades:
- `no-show-imediato`: agendado para **15 min após o horário original da reunião** (não após o movimento). Se já passou desse ponto, dispara imediatamente.
- `no-show-2h`: agendado para 2h após o horário original.

### 10. Cancelamento
- Se a reunião for reagendada (alteração de data/hora no drawer), regeneramos os lembretes futuros.
- Se o lead for movido para "Ganho", "Perdido" ou removido de Reunião Marcada, os lembretes pendentes são cancelados (exceto no-show, quando aplicável).

## Detalhes técnicos

### Storage
Novo tipo `Reminder` em `src/lib/store.ts` persistido em `user_storage` (mesma abordagem dos meetings):
```ts
type Reminder = {
  id: string; leadId: string; meetingId?: string;
  kind: string; // 'reserva-confirmada' | 'boas-vindas' | ...
  title: string; message: string;
  scheduledFor: string; // ISO
  status: 'pending' | 'sent' | 'dismissed';
  createdAt: string; sentAt?: string;
}
```
Helpers: `getReminders`, `createRemindersForMeeting(lead, meeting)`, `cancelPendingReminders(leadId)`, `regenerateReminders(leadId)`, `markReminderSent(id)`.

### Geração de mensagens
Função `buildReminderMessages(lead, meeting)` retorna array `{kind, scheduledFor, title, message}` com os textos exatos do brief, substituindo `[Nome]`, `[Empresa]`, `[DATA]`, `[HORA]`, `[HORÁRIO]`, `[LINK DA CALL]` (usa `meeting.link` / `meetLink`). Protocolo = `#` + primeiros 6 chars do `lead.id` em maiúsculo.

### Hook global de notificações
`src/hooks/useReminderNotifications.ts` — carregado no `AppLayout`. `setInterval` de 60s: pega reminders `pending` com `scheduledFor <= now`, dispara `new Notification(...)`, marca como `sent` (ou mantém `pending` até o usuário confirmar — decisão: marca como `sent` automaticamente para evitar spam, mas mantém visível na lista).

### Integrações
- `scheduleMeeting` em `store.ts`: chama `createRemindersForMeeting` no final.
- Nova função `handleMeetingRescheduled` chamada quando drawer atualiza data/hora.
- `PipelineBoard` (mudança de estágio): quando lead entra em "No Show" (Oportunidades), chama `createNoShowReminders(lead)`; quando sai de Reunião Marcada sem ir para No Show, cancela pendentes de reunião.

### Rota e navegação
- Nova rota `/lembretes` em `App.tsx`.
- Item "Lembretes" em `AppSidebar.tsx` com badge do número de pendentes atrasados.

## Arquivos afetados
- **novo** `src/pages/Lembretes.tsx`
- **novo** `src/lib/reminders.ts` (geração de mensagens + regras de tempo)
- **novo** `src/hooks/useReminderNotifications.ts`
- `src/lib/store.ts` — tipo `Reminder`, CRUD, integração com `scheduleMeeting`
- `src/components/ScheduleMeetingDialog.tsx` — nada além do que já faz (o store cuida)
- `src/components/LeadDetailDrawer.tsx` — quando editar data/hora da reunião, chamar regenerate
- `src/components/PipelineBoard.tsx` — hooks nas mudanças de estágio (No Show / saída)
- `src/App.tsx` — rota `/lembretes`
- `src/components/AppSidebar.tsx` — item de menu
- `src/components/AppLayout.tsx` — monta o hook global de notificações

## Limitações que serão comunicadas ao usuário
- Notificações Chrome só disparam com **o CRM aberto em alguma aba** (sem push nativo em background — isso exigiria backend + service worker + VAPID; posso adicionar depois se quiser).
- Os lembretes são **textos prontos para copiar** — o CRM não envia WhatsApp/e-mail automaticamente, só notifica você e mostra a mensagem exata a enviar.
