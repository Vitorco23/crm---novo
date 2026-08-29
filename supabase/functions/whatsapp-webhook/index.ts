import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { readWebhookJson } from "../_shared/webhook-security.ts"

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function isValidMetaSignature(rawBody: string, signature: string, appSecret: string): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(expected, signature);
}

serve(async (req) => {
  const { method } = req
  const url = new URL(req.url)

  // 1. Verificação do Webhook (GET)
  if (method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    // O token de verificação vive APENAS nos secrets da edge function.
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN")
    if (!verifyToken) {
      console.error('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN not configured')
      return new Response('Forbidden', { status: 403 })
    }
    
    console.log("[WhatsApp Webhook] Verification request", { mode, hasToken: Boolean(token) })

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
      const parsed = await readWebhookJson(req)
      if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), {
          status: parsed.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const rawBody = parsed.raw
      const appSecret = Deno.env.get("WHATSAPP_APP_SECRET")
      const signature = req.headers.get("x-hub-signature-256") ?? ""

      // Enforce Meta's HMAC signature when the app secret is configured. The
      // compatibility path keeps the existing integration alive until the
      // secret is added to the Edge Function environment.
      if (appSecret && !(await isValidMetaSignature(rawBody, signature, appSecret))) {
        console.warn("[WhatsApp Webhook] Invalid Meta signature")
        return new Response('Unauthorized', { status: 401 })
      }
      if (!appSecret) {
        console.warn("[WhatsApp Webhook] WHATSAPP_APP_SECRET is not configured; signature validation is disabled")
      }

      const body = parsed.value
      console.log("[WhatsApp Webhook] Received event", {
        object: body?.object,
        entries: Array.isArray(body?.entry) ? body.entry.length : 0,
      })

      // Validação básica da Meta
      if (body.object !== 'whatsapp_business_account') {
        return new Response('Not a WhatsApp event', { status: 404 })
      }

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      for (const entry of ((body as any).entry ?? []) as any[]) {
        for (const change of entry.changes) {
          const value = change.value
          if (!value) continue

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

              console.log("[WhatsApp Webhook] Inbound message", { type, hasBody: Boolean(bodyText) })

              // Tentar localizar o Lead e o User_ID
              const { data: storageRows, error: storageError } = await supabaseClient
                .from('user_storage')
                .select('user_id, value')
                .eq('key', 'p21_leads')
                .contains('value', [{ phoneNormalized: fromPhone }])

              if (storageError) {
                console.error('[WhatsApp Webhook] Error searching leads:', storageError)
              }

              const targetUserId = storageRows?.[0]?.user_id
              const leads = storageRows?.[0]?.value as any[] | undefined
              const targetLead = leads?.find((l: any) => l.phoneNormalized === fromPhone)

              if (targetUserId) {
                console.log("[WhatsApp Webhook] Lead matched", { hasLeadId: Boolean(targetLead?.id) })
                
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
                console.warn("[WhatsApp Webhook] No lead/user match for inbound message")
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
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Error processing POST:', err instanceof Error ? err.message : 'unknown_error')
      return new Response(JSON.stringify({ error: 'internal_error' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response('Method not allowed', { status: 405 })
})
