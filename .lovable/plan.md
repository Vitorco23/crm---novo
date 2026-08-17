# Plano de Implementação — Notificação de Novos Leads por E-mail

Adicionar uma camada de notificação imediata por e-mail para cada lead recebido com sucesso via Edge Function, garantindo que o fluxo principal não seja bloqueado por falhas no envio.

## Etapas

1. **Configuração de Infraestrutura**:
   - Como o Lovable Cloud ainda não possui domínio de e-mail configurado para este projeto, utilizaremos o **Resend** conforme solicitado.
   - O usuário precisará configurar os Secrets: `RESEND_API_KEY`, `LEAD_NOTIFICATION_EMAIL` e `LEAD_NOTIFICATION_FROM`.

2. **Modificação da Edge Function `receive-landing-lead`**:
   - Implementar a função `sendLeadNotification` com suporte a timeout e captura de erros.
   - Disparar o envio apenas após o sucesso do `INSERT` no banco de dados.
   - Garantir que erros ou timeouts no e-mail não retornem erro 500 para a Landing Page.

3. **Template de E-mail**:
   - Criar um template HTML limpo com os dados do lead (Nome, Empresa, WhatsApp, Nicho, Desafio, etc.).
   - Incluir um botão CTA para abrir o CRM em `https://crm.performance21.com.br/oportunidades`.

4. **Validação**:
   - Logs detalhados para monitorar o status do envio.
   - Verificação de que o Realtime e outras rotinas não disparam e-mails duplicados (a lógica será restrita à Edge Function).

## Detalhes Técnicos

- **Provedor**: Resend (API REST).
- **Secrets**:
  - `RESEND_API_KEY`: Chave da API do Resend.
  - `LEAD_NOTIFICATION_EMAIL`: E-mail de destino dos alertas.
  - `LEAD_NOTIFICATION_FROM`: E-mail de remetente (deve ser um domínio validado no Resend).
- **Timeout**: 7 segundos para a requisição ao Resend.
- **Resiliência**: Bloco `try-catch` em torno do envio de e-mail para não interromper a resposta HTTP 200 do lead.
