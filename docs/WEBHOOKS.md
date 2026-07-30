# Webhooks públicos

Base URL das Edge Functions:

```text
https://<project-ref>.supabase.co/functions/v1/
```

Ambos os webhooks são públicos (sem JWT de usuário) e protegidos por **segredo
compartilhado**. Eles apenas persistem o payload em uma fila — nunca executam IA nem
alteram regra de negócio diretamente.

---

## 1. `receive-matteline-call`

Recebe o resultado de uma ligação e enfileira uma interação para o lead correspondente.

**Método:** `POST` · **Content-Type:** `application/json`

### Autenticação

O segredo (`MATTELINE_WEBHOOK_SECRET`) pode ser enviado em qualquer um destes headers,
comparados em tempo constante:

```text
x-callface-signature   (usado pela Matteline/Callface)
x-matteline-signature
x-matteline-secret
x-webhook-secret
x-secret
x-api-key
secret
apikey
Authorization: Bearer <segredo> | Basic <...> | <valor puro>
```

Segredo ausente ou inválido → `401 { "error": "unauthorized" }`.

### Payload aceito

```json
{
  "call_id": "abc-123",
  "summarization": "Resumo da ligação",
  "transcription": "Transcrição completa",
  "call_link": "https://...",
  "call_duration": 320,
  "call_audio_url": "https://...",
  "user_email": "vendedor@performance21.com.br",
  "user_name": "Vitor",
  "destination_number": "+55 11 99999-9999",
  "call_status": "answered",
  "deal_closure_percentage": 40,
  "scheduling": "2026-08-01T14:00:00-03:00"
}
```

### Comportamento

1. Valida o segredo.
2. Normaliza `destination_number` para `55 + DDD + número` (`phone_normalized`).
3. Insere em `interactions_inbound` de forma **idempotente** por `call_id`
   (índice único parcial) — reenvios não duplicam.
4. Responde `200 { ok: true }`.
5. Logs de produção não registram payload nem transcrição.

O CRM consome a fila com `pullInboundInteractions()` / `syncInboundInteractions()`,
casa a interação com o lead pelo telefone canônico e adiciona à timeline.

---

## 2. `receive-landing-lead`

Recebe leads do formulário da Landing Page.

**Método:** `POST` · **Header de assinatura:** `x-landing-signature`
(comparado com `LANDING_WEBHOOK_SECRET`).

### Payload aceito

Aliases em português e inglês são suportados:

```json
{
  "nome": "Fulano",          
  "email": "fulano@empresa.com",
  "whatsapp": "11999999999",  
  "empresa": "Empresa X",     
  "nicho": "Odontologia",     
  "cidade": "São Paulo",      
  "instagram": "@empresa",
  "observacoes": "veio do anúncio",
  "meetingISO": "2026-08-01T14:00:00-03:00",
  "meetingEndISO": "2026-08-01T15:00:00-03:00",
  "durationMinutes": 60,
  "timeZone": "America/Sao_Paulo",
  "withMeet": true,
  "source": "landing"
}
```

Equivalências: `name`/`nome`, `phone`/`telefone`/`whatsapp`, `company`/`empresa`,
`niche`/`nicho`, `city`/`cidade`, `notes`/`observacoes`.

### Comportamento

1. Valida a assinatura.
2. Persiste o lead na fila `leads_inbound` (e no storage do usuário proprietário).
3. Se houver `meetingISO`, cria o evento no Google Calendar (com Meet quando
   `withMeet` não for `false`) reutilizando a lógica de `create-google-meeting`.
4. O lead entra na primeira etapa do pipeline de Oportunidades (`Reunião Marcada`).

---

## 3. Boas práticas de integração

- Reenvie com o mesmo `call_id` para aproveitar a idempotência.
- Envie `Content-Type: application/json`; requisições `OPTIONS` recebem CORS liberado.
- Códigos de resposta: `200` sucesso · `400` payload inválido · `401` segredo inválido ·
  `500` erro interno (detalhes ficam apenas nos logs do servidor).
- Ao rotacionar um segredo, atualize a secret no backend e faça novo deploy da função.
