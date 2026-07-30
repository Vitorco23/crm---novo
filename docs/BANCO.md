# Banco de Dados

> Backend gerenciado pelo Lovable Cloud (Supabase / Postgres). Schema `public`.
> Extensão `vector` (pgvector) habilitada para busca semântica.

## Tabelas

### `user_storage`
Persistência multi-dispositivo do estado do CRM (leads, filtros, cadência, lembretes,
metas, finanças, sessões de Pomodoro etc.).

| Coluna | Tipo |
|---|---|
| `user_id` | uuid |
| `key` | text |
| `value` | jsonb |
| `updated_at` | timestamptz |

Chave lógica: (`user_id`, `key`). Acesso restrito ao próprio usuário via RLS.

---

### `leads_inbound`
Fila de entrada de leads recebidos pelo webhook da Landing Page.

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `dados` | jsonb (payload bruto normalizado) |
| `created_at` | timestamptz |

Consumida por `pullInboundLeads()` no cliente, que insere o lead na primeira etapa
do pipeline de Oportunidades.

---

### `interactions_inbound`
Fila de entrada de interações (ligações) recebidas do provedor de telefonia.

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `call_id` | text (idempotência) |
| `dados` | jsonb |
| `phone_normalized` | text (`55 + DDD + número`) |
| `processed` | boolean |
| `processed_at` | timestamptz |
| `created_at` | timestamptz |

Índice único parcial em `call_id` garante que reenvios do webhook não dupliquem
interações. O casamento com o lead ocorre por `phone_normalized`.

---

### `knowledge_documents`
Documentos oficiais da Knowledge Base.

`id`, `titulo`, `categoria`, `descricao`, `tags[]`, `conteudo_markdown`, `versao`,
`ativo`, `owner_email`, `created_at`, `updated_at`.

### `knowledge_document_versions`
Histórico imutável de versões de cada documento: `document_id`, `versao`, `titulo`,
`categoria`, `descricao`, `tags[]`, `conteudo_markdown`, `created_at`.

### `knowledge_chunks`
Trechos vetorizados para RAG: `document_id`, `chunk_index`, `content`,
`embedding` (vector), `metadata` (jsonb).

Busca semântica feita por função SQL de similaridade, sempre filtrada por
ownership/RLS do documento pai.

---

### `commercial_memory`
Memória comercial aprendida pela IA.

`id`, `kind`, `title`, `content`, `metadata` (jsonb), `embedding` (vector),
`source_lead_id`, `confidence` (real), `usage_count`, `approved`, timestamps.

Alimentada pela função `extract-memory` e consultada pelo motor de memória
(`_shared/ai-core/memory-engine.ts`).

---

### `intel_conversations` / `intel_messages`
Histórico da Central de Inteligência.

- `intel_conversations`: `id`, `owner_email`, `title`, timestamps.
- `intel_messages`: `id`, `conversation_id`, `role`, `content`, `specialist`,
  `context_snapshot` (jsonb), `citations` (jsonb), `model_used`, `created_at`.

Conversas são isoladas por `owner_email`.

---

### `ai_router_logs`
Telemetria do roteador de modelos: `task`, `model`, `attempt_index`, `input_chars`,
`latency_ms`, `success`, `error_type`, `fallback_reason`, `created_at`.

### `ai_execution_events`
Observabilidade de IA (Fase 3D.1). Registra **apenas metadados**, nunca conteúdo:

`user_id`, `conversation_id`, `lead_id`, `execution_id`, `specialist`, `task`,
`prompt_id`, `prompt_version`, `model`, `status`, `latency_ms`, `input_chars`,
`output_chars`, `input_tokens`, `output_tokens`, `estimated_cost`, `sources[]`,
`tools_used[]`, `error_code`.

Gravação é best-effort: falha de telemetria nunca bloqueia a resposta da IA.

## Políticas de acesso

- RLS habilitada nas tabelas do schema `public`.
- Dados do usuário (`user_storage`, conversas, knowledge) são escopados por
  `auth.uid()` ou `owner_email`.
- Filas de webhook (`leads_inbound`, `interactions_inbound`) são escritas apenas por
  Edge Functions com service role e lidas por usuários autenticados.
- Grants explícitos (`authenticated`, `service_role`) acompanham cada tabela.

## Migrations

As migrations vivem em `supabase/migrations/`. No Lovable Cloud elas são aplicadas
diretamente no projeto gerenciado; o ledger local pode não refletir execuções feitas
pela plataforma. A fonte da verdade do schema é o banco em produção.
