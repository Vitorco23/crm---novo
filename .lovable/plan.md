## Objetivo
Quando você confirmar uma reunião no popup "Marcar Reunião", o CRM cria automaticamente um evento na **sua** agenda do Google, com link do **Google Meet**, e **convida o lead por e-mail**.

## Como vai funcionar (visão do usuário)

1. Você clica em "Conectar Google Agenda" (uma vez só) — faz login na sua conta Google e autoriza.
2. No popup de "Marcar Reunião" aparece um campo novo: **E-mail do lead**.
3. Ao confirmar, o CRM:
   - Cria o evento na sua agenda Google na data/hora escolhida.
   - Gera link do Meet automaticamente.
   - Envia convite por e-mail para o lead.
   - Move o lead para "Reunião Marcada" (já funciona hoje).
   - Mostra o link do Meet no card e no drawer do lead.

```text
[Marcar Reunião popup]
  ├── Data, Horário, Contato, Canal, Pauta (já existe)
  ├── + E-mail do lead (novo)
  └── Confirmar ──► Edge Function ──► Google Calendar API
                                            │
                                            ├─► Cria evento + Meet
                                            ├─► Convida lead por e-mail
                                            └─► Retorna meetingLink
                       Lead salvo com googleEventId + meetingLink
```

## O que vai mudar

### 1. Ativar Lovable Cloud
Necessário para rodar a edge function que conversa com o Google. Backend gerenciado, sem conta externa.

### 2. Conectar Google Calendar (connector)
Ao implementar, vou abrir o seletor de conexão. Você faz login na sua conta Google e autoriza acesso à agenda. As credenciais ficam guardadas com segurança no Lovable Cloud.

### 3. Edge function `create-google-meeting`
Recebe os dados da reunião do frontend, chama a API do Google Calendar via gateway autenticado, cria o evento com:
- `summary`: "Reunião — {empresa do lead}"
- `start` / `end`: data + horário (duração padrão 30 min, configurável depois)
- `attendees`: e-mail do lead
- `conferenceData`: gera link Meet automaticamente
- `description`: pauta + nome do contato + telefone

Retorna `{ eventId, meetLink, htmlLink }`.

### 4. Mudanças no frontend

**`src/lib/store.ts`**
- Adicionar campos ao tipo `Meeting`: `googleEventId?`, `meetLink?`, `googleEventUrl?`, `attendeeEmail?`.

**`src/components/ScheduleMeetingDialog.tsx`**
- Novo campo "E-mail do lead" (com validação).
- Ao confirmar: chama a edge function; se OK, salva a meeting com `googleEventId` + `meetLink` e move o lead.
- Se a integração não estiver conectada, exibe aviso e segue só com o agendamento local (não bloqueia).

**`src/components/LeadDetailDrawer.tsx`**
- Mostrar botão "Abrir Google Meet" se houver `meetLink`.
- Mostrar "Ver no Google Agenda" linkando para `googleEventUrl`.

**`src/components/PipelineBoard.tsx`** (card do lead)
- Pequeno ícone "Meet" se a próxima reunião agendada tiver link.

### 5. Página de configurações (mínima)
Um card simples na aba **Metas** (ou nova rota `/integracoes`) mostrando:
- Status: "Google Agenda conectado ✓" ou "Não conectado"
- Botão para conectar/desconectar
- Calendário padrão: `primary` (sua agenda principal)

## Detalhes técnicos

- **Connector usado:** `google_calendar` (já disponível no Lovable, OAuth gerenciado, refresh automático de token).
- **Endpoint chamado:** `POST https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`
- **`sendUpdates=all`** é o que dispara o e-mail de convite para o lead.
- **`conferenceDataVersion=1`** é o que permite criar o link do Meet automaticamente.
- **Fuso horário:** vou usar o fuso do navegador do usuário (`Intl.DateTimeFormat().resolvedOptions().timeZone`) ao montar o evento.
- **Validação de e-mail:** Zod no frontend e na edge function.
- **Tratamento de erro:** se a API do Google falhar, o evento local é criado mesmo assim e mostro um toast com a mensagem de erro — você pode tentar reagendar depois.

## O que NÃO entra agora (posso adicionar depois se quiser)
- Editar/cancelar a reunião também atualiza no Google Calendar (hoje só cria).
- Lembretes customizados (vai usar os defaults da sua agenda).
- Sincronização inversa (eventos criados no Google aparecerem no CRM).
- Reagendar arrastando no kanban atualiza o evento no Google.