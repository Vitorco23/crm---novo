
-- Sprint 1C: WhatsApp Cloud API Integration
-- Criar tabela de mensagens do WhatsApp e configurar permissões.

CREATE TABLE public.whatsapp_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_message_id text UNIQUE NOT NULL,
    phone_number text NOT NULL,
    lead_id uuid, -- Referência ao lead (se encontrado no user_storage)
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type text NOT NULL,
    body text,
    status text CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    timestamp timestamptz NOT NULL,
    raw_payload jsonb,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

-- RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own whatsapp messages"
ON public.whatsapp_messages
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX idx_whatsapp_messages_phone_number ON public.whatsapp_messages(phone_number);
CREATE INDEX idx_whatsapp_messages_user_id ON public.whatsapp_messages(user_id);
CREATE INDEX idx_whatsapp_messages_wa_message_id ON public.whatsapp_messages(wa_message_id);
CREATE INDEX idx_whatsapp_messages_lead_id ON public.whatsapp_messages(lead_id);
