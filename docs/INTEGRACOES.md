# Integrações

## 1. Lovable Cloud (Supabase)

Backend gerenciado: Postgres, Auth, Storage e Edge Functions.

- Cliente: `src/integrations/supabase/client.ts` (gerado automaticamente, não editar).
- Tipos: `src/integrations/supabase/types.ts` (gerado automaticamente).
- Sessão persistida em `localStorage` com refresh automático.

Autenticação por e-mail/senha, com recuperação de senha em `/reset-password` e
guarda de rotas via `ProtectedRoute` + `AuthContext`.

## 2. Google Calendar

Acessado pelo **connector gateway** do Lovable a partir das Edge Functions —
o frontend nunca manipula credenciais do Google.

| Edge Function | Uso |
|---|---|
| `create-google-meeting` | Cria reunião (com link Meet) e convida o lead por e-mail |
| `update-google-meeting` | Reagenda a reunião existente |
| `google-calendar-availability` | Consulta disponibilidade de horários |
| `google-calendar-status` | Verifica se a conexão está ativa |
| `list-google-events` | Lista eventos exibidos em `/agenda` |
| `create-task-event` / `update-task-event` / `delete-task-event` | Tarefas do lead espelhadas no calendário |

No cliente, tudo passa por `AgendaRepository` (`src/modules/agenda/services/`).

Regras de negócio: "Marcar Reunião" move o lead para Oportunidades › Reunião Marcada,
cria o evento (opcional) e gera lembretes automáticos. Alterar o horário no CRM
atualiza o evento no Google Calendar.

## 3. Lovable AI Gateway

Provedor único de modelos, autenticado por `LOVABLE_API_KEY` (secret do backend).
Detalhes em [IA.md](./IA.md).

## 4. Servidor MCP (agentes externos)

Implementado em `src/modules/configuracoes/services/mcp/` com `@lovable.dev/mcp-js`.

Ferramentas expostas:

| Ferramenta | Função |
|---|---|
| `create-lead` | Cria um lead no pipeline |
| `get-lead` | Retorna um lead pelo identificador |
| `list-leads` | Lista leads com filtros |
| `log-call` | Registra uma ligação/interação |
| `pipeline-summary` | Resumo do funil |
| `upcoming-meetings` | Próximas reuniões |

## 5. Webhooks de entrada

Landing Page e provedor de telefonia (Matteline/Callface). Ver [WEBHOOKS.md](./WEBHOOKS.md).

## 6. PWA

`public/manifest.webmanifest`, `public/sw.js` e `src/pwa/`. O app é instalável em
desktop e mobile; `ForceUpdateButton` (Configurações) força a atualização do
Service Worker quando o cache do dispositivo ficar defasado.

## 7. Telefone canônico

Todas as integrações que trazem telefone usam `normalizePhoneBR()`
(`src/shared/services/userStorage.ts`), que produz `55 + DDD + número`. Esse valor é a
chave de casamento entre interações recebidas por webhook e leads existentes.

## 8. Secrets utilizados

| Secret | Onde |
|---|---|
| `LOVABLE_API_KEY` | Todas as funções de IA e connector gateway |
| `MATTELINE_WEBHOOK_SECRET` | `receive-matteline-call` |
| `LANDING_WEBHOOK_SECRET` | `receive-landing-lead` |
| `WHATSAPP_APP_SECRET` | Validação HMAC opcional do webhook oficial da Meta |
| `GOOGLE_CALENDAR_API_KEY` | Funções de calendário |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injetados pela plataforma |

Secrets existem apenas no ambiente das Edge Functions e nunca são expostos ao cliente.


### Segurança do webhook WhatsApp

Quando `WHATSAPP_APP_SECRET` está configurado, `whatsapp-webhook` valida o header
`x-hub-signature-256` antes de processar o evento. O caminho sem essa secret foi
mantido temporariamente para compatibilidade; configure-a antes de exigir a assinatura
em todos os ambientes.
