# Deploy e Operação

## 1. Ambientes

| Ambiente | URL |
|---|---|
| Preview (editor) | `https://id-preview--<project-id>.lovable.app` |
| Publicado | `https://crmp21.lovable.app` |
| Domínio customizado | `https://crm.performance21.com.br` |

O backend é um projeto **Lovable Cloud gerenciado**: não há acesso ao dashboard do
Supabase, à senha do banco nem à service role key. Migrations, secrets e deploy de
Edge Functions são executados pela plataforma.

## 2. Desenvolvimento local

```sh
git clone <repo>
cd <repo>
npm i
npm run dev      # Vite em http://localhost:8080
```

Scripts disponíveis:

| Script | Uso |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo development |
| `npm run preview` | Servir o build local |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (execução única) |
| `npm run test:watch` | Vitest em watch |

Variáveis de ambiente do frontend (`.env`, geradas automaticamente):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
Não editar manualmente.

## 3. Deploy do frontend

Publicação pelo editor do Lovable (botão **Publish**). Cada publicação gera um novo
build estático servido no domínio publicado e no domínio customizado.

## 4. Edge Functions

Ficam em `supabase/functions/<nome>/index.ts` e são implantadas automaticamente ao
serem alteradas. Configuração em `supabase/config.toml`:

```toml
project_id = "<project-ref>"

[functions.audit-transcript]
verify_jwt = false
```

Regras operacionais:

- Funções internas exigem JWT de usuário validado em código por
  `_shared/require-auth.ts` (`requireUser`), que usa `supabase.auth.getClaims()` com a
  anon key — nunca service role.
- Webhooks públicos (`receive-matteline-call`, `receive-landing-lead`) autenticam por
  segredo compartilhado, não por JWT.
- Código compartilhado vive em `supabase/functions/_shared/` e é importado pelas funções.

### Secrets

Configurados no backend (Cloud → Secrets):
`LOVABLE_API_KEY`, `MATTELINE_WEBHOOK_SECRET`, `LANDING_WEBHOOK_SECRET`,
`GOOGLE_CALENDAR_API_KEY`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma.

Após alterar uma secret, refaça o deploy da função que a consome.

## 5. Banco de dados

Alterações de schema são feitas por migration SQL aplicada pela plataforma. Toda nova
tabela em `public` deve incluir, na mesma migration: `CREATE TABLE` → `GRANT` →
`ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`.

## 6. PWA e cache

O app é um PWA instalável. Quando um dispositivo não recebe atualizações:

1. Usar **Forçar atualização** em Configurações (`ForceUpdateButton`), que desregistra
   o Service Worker e limpa caches; ou
2. Fechar e reabrir o app instalado.

## 7. Monitoramento

- **Saúde do Sistema** (`/saude-sistema`): diagnóstico das integrações e do backend.
- `ai_router_logs`: tentativas, fallbacks e latência dos modelos.
- `ai_execution_events`: metadados de execuções de IA (sem conteúdo sensível).
- Logs das Edge Functions disponíveis no backend, sem payloads sensíveis.

## 8. Checklist pós-deploy

1. Login funciona no domínio publicado.
2. Pipelines carregam e o board sincroniza entre dispositivos.
3. Webhooks retornam `200` em um teste de envio.
4. Google Calendar conectado (`google-calendar-status`).
5. **Atualizar Inteligência** em um lead responde sem erro.
6. Missão do Dia gera a lista diária.
