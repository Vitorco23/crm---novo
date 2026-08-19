# Plano - Sprint 1A: Backend Real do WhatsApp via QR Code

Este plano detalha a implementação do backend em Node.js/TypeScript para gerenciar a sessão do WhatsApp Web utilizando `whatsapp-web.js` e a integração com o frontend existente do CRM Performance21.

## Backend (whatsapp-server)

### 1. Estrutura e Tecnologias
- Criar a pasta `whatsapp-server/` na raiz do projeto.
- Utilizar **Node.js**, **TypeScript**, **Express**, **whatsapp-web.js**, **Puppeteer** (headless), **CORS**, **dotenv** e **Supabase Auth** para segurança.

### 2. Gerenciamento de Sessão e Estado
- Implementar `WhatsAppClientManager` para controlar a instância única do cliente WhatsApp.
- Utilizar `LocalAuth` para persistência da sessão em disco (caminho configurável via `WHATSAPP_SESSION_PATH`).
- Estados suportados: `DISCONNECTED`, `INITIALIZING`, `WAITING_QR`, `AUTHENTICATING`, `CONNECTED`, `RECONNECTING`, `ERROR`.

### 3. Endpoints da API
- `GET /health`: Health check público.
- `GET /whatsapp/status`: Retorna o estado atual da conexão (Protegido).
- `POST /whatsapp/session/start`: Inicializa ou restaura a sessão (Protegido, Idempotente).
- `POST /whatsapp/session/logout`: Encerra a sessão e limpa dados locais (Protegido).
- `GET /whatsapp/qr`: Retorna o QR Code atual se disponível (Protegido).

### 4. Comunicação em Tempo Real
- Implementar **SSE (Server-Sent Events)** no endpoint `GET /whatsapp/events` para notificar o frontend sobre mudanças de estado e novos QR Codes.

### 5. Segurança
- Todos os endpoints (exceto `/health`) exigirão o header `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`.
- Validação do token utilizando a biblioteca `@supabase/supabase-js`.

## Frontend (CRM)

### 1. Integração do Service
- Atualizar `src/modules/whatsapp/services/whatsappService.ts` para incluir o envio do token de autenticação do Supabase.
- Implementar o consumo do endpoint SSE para atualizações em tempo real.

### 2. Ajustes na Interface
- Refinar `WhatsAppPage.tsx` e `WhatsAppConnection.tsx` para reagir aos eventos SSE.
- Garantir que a interface trate corretamente falhas de conexão com o backend (fallback amigável).

## Detalhes Técnicos
- O backend requer um ambiente com filesystem persistente para manter o login após reinicializações.
- Puppeteer será configurado com flags `--no-sandbox` para compatibilidade com containers.
- **NÃO** serão implementadas funcionalidades de mensagens ou contatos nesta sprint.

## Arquivos a serem criados/modificados
- `whatsapp-server/package.json` (Novo)
- `whatsapp-server/tsconfig.json` (Novo)
- `whatsapp-server/.env.example` (Novo)
- `whatsapp-server/src/server.ts` (Novo)
- `whatsapp-server/src/whatsapp/whatsappClient.ts` (Novo)
- `src/modules/whatsapp/services/whatsappService.ts` (Modificado)
- `src/modules/whatsapp/pages/WhatsAppPage.tsx` (Modificado)
