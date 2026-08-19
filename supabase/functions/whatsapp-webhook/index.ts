import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-id@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** 
 * Normaliza telefone para o formato do CRM (55 + DDD + número, só dígitos).
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  // Se não começar com 55 e tiver 10 ou 11 dígitos, assume BR
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

serve(async (req) => {
  const { method } = req
  const url = new URL(req.url)

  // 1. Verificação do Webhook (GET)
  if (method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Verification success')
      return new Response(challenge, { status: 200 })
    }

    console.warn('[WhatsApp Webhook] Verification failed')
    return new Response('Forbidden', { status: 403 })
  }

  // 2. Receber Eventos (POST)
  if (method === 'POST') {
    try {
      const body = await req.json()
      console.log('[WhatsApp Webhook] Received payload:', JSON.stringify(body, null, 2))

      // Validação básica da Meta
      if (body.object !== 'whatsapp_business_account') {
        return new Response('Not a WhatsApp event', { status: 404 })
      }

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value
          if (!value) continue

          // O Phone Number ID da conta que recebeu a mensagem
          // (Poderia ser usado para identificar o user_id se tivéssemos mapeamento)
          // Por enquanto, como o CRM é multi-tenant via user_storage, precisamos 
          // de uma estratégia para associar ao user_id correto.
          // PREMISSÃO: O sistema é usado por um admin ou os números são únicos.
          // Para esta sprint, vamos buscar o usuário que "possui" o lead com este telefone.

          // Processar Mensagens
          if (value.messages) {
            for (const msg of value.messages) {
              const waMessageId = msg.id
              const fromPhone = normalizePhone(msg.from)
              const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString()
              const type = msg.type
              let bodyText = null

              if (type === 'text') {
                bodyText = msg.text.body
              } else {
                bodyText = `[${type}]`
              }

              console.log(`[WhatsApp Webhook] Message from ${fromPhone}: ${bodyText}`)

              // Tentar localizar o Lead e o User_ID
              // Buscamos no user_storage onde o valor (JSON) contenha um lead com este telefone.
              // Como os leads estão dentro de um array 'p21_leads' no user_storage, 
              // usamos a busca por JSONB.
              
              const { data: storageRows, error: storageError } = await supabaseClient
                .from('user_storage')
                .select('user_id, value')
                .eq('key', 'p21_leads')
                // Esta query busca o telefone normalizado dentro do array de objetos
                .contains('value', [{ phoneNormalized: fromPhone }])

              if (storageError) {
                console.error('[WhatsApp Webhook] Error searching leads:', storageError)
              }

              const targetUserId = storageRows?.[0]?.user_id
              const leads = storageRows?.[0]?.value as any[] | undefined
              const targetLead = leads?.find(l => l.phoneNormalized === fromPhone)

              if (targetUserId) {
                console.log(`[WhatsApp Webhook] Lead matched: ${targetLead?.id} for user ${targetUserId}`)
                
                // Salvar a mensagem
                const { error: insertError } = await supabaseClient
                  .from('whatsapp_messages')
                  .upsert({
                    wa_message_id: waMessageId,
                    phone_number: fromPhone,
                    lead_id: targetLead?.id || null,
                    direction: 'inbound',
                    message_type: type,
                    body: bodyText,
                    timestamp: timestamp,
                    raw_payload: body,
                    user_id: targetUserId
                  }, { onConflict: 'wa_message_id' })

                if (insertError) {
                  console.error('[WhatsApp Webhook] Error inserting message:', insertError)
                }
              } else {
                console.warn(`[WhatsApp Webhook] No lead/user found for phone ${fromPhone}`)
                // Opcional: Salvar mesmo sem lead se tivéssemos um user_id padrão ou sistema global
              }
            }
          }

          // Processar Status
          if (value.statuses) {
            for (const status of value.statuses) {
              const waMessageId = status.id
              const statusName = status.status // sent, delivered, read, failed

              console.log(`[WhatsApp Webhook] Status update for ${waMessageId}: ${statusName}`)

              const { error: updateError } = await supabaseClient
                .from('whatsapp_messages')
                .update({ status: statusName })
                .eq('wa_message_id', waMessageId)

              if (updateError) {
                console.error('[WhatsApp Webhook] Error updating status:', updateError)
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (err) {
      console.error('[WhatsApp Webhook] Error processing POST:', err)
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response('Method not allowed', { status: 405 })
})
