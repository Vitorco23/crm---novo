# Plano: Sprint 1C — Webhook Oficial do WhatsApp Cloud API

Este plano descreve a implementação da infraestrutura necessária para integrar o CRM P21 com a WhatsApp Cloud API da Meta, utilizando Supabase Edge Functions como webhook.

## Mudanças do Usuário
- Criar uma Supabase Edge Function `whatsapp-webhook` para validação (GET) e recebimento de mensagens (POST).
- Criar a tabela `whatsapp_messages` no banco de dados para armazenar o histórico de mensagens.
- Implementar lógica de normalização de telefone e associação de mensagens a leads existentes.
- Garantir idempotência no processamento de mensagens.
- Configurar secrets necessários no backend.

## Detalhes Técnicos

### 1. Banco de Dados (SQL Migration)
- Criar tabela `public.whatsapp_messages`:
  - `id` (uuid, primary key)
  - `wa_message_id` (text, unique) - ID da mensagem fornecido pela Meta.
  - `phone_number` (text) - Número normalizado.
  - `lead_id` (uuid, nullable) - FK para a tabela de leads (preciso confirmar se é `leads` ou `leads_inbound`).
  - `direction` (text) - 'inbound' ou 'outbound'.
  - `message_type` (text).
  - `body` (text, nullable).
  - `status` (text, nullable) - 'sent', 'delivered', 'read', 'failed'.
  - `timestamp` (timestamptz) - Quando a mensagem foi enviada.
  - `raw_payload` (jsonb, nullable).
  - `created_at` (timestamptz, default now).
- Habilitar RLS e permissões (Grants).

### 2. Edge Function: `whatsapp-webhook`
- **GET**: Implementar o desafio de verificação da Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- **POST**:
  - Receber o payload JSON da Meta.
  - Extrair informações da mensagem (`messages[]`, `statuses[]`).
  - Normalizar o telefone (somente dígitos, prefixo de país).
  - Buscar lead correspondente (baseado no telefone).
  - Persistir na tabela `whatsapp_messages` (usando `upsert` por `wa_message_id` para idempotência).
  - Tratar atualizações de status.

### 3. Segredos (Secrets)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: Token para o GET.
- `META_APP_SECRET`: Para validação de assinatura `X-Hub-Signature-256` (opcional nesta fase, mas recomendado).

### 4. Localização da Tabela de Leads
- Inspecionar `src/integrations/supabase/types.ts` ou rodar query para confirmar se a tabela principal de leads é `leads`.

## Considerações de Segurança
- A Edge Function deve ser pública (sem auth JWT do Supabase).
- Validação rigorosa dos tokens de verificação e assinatura da Meta.
- Não expor segredos no frontend.

## User Review Required
- Confirmação da tabela de leads correta (provavelmente `leads`).
- Definição do token de verificação (vou gerar um aleatório ou pedir para você definir).
