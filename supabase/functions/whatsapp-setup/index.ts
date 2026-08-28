import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { requireUser } from "../_shared/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const auth = await requireUser(req, corsHeaders)
  if (!auth.ok) return auth.response

  try {
    const { action, wabaId } = await req.json()
    const configuredWabaId = Deno.env.get('WHATSAPP_WABA_ID')
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'WHATSAPP_ACCESS_TOKEN not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!wabaId || typeof wabaId !== 'string' || !/^\d{5,25}$/.test(wabaId)) {
      return new Response(JSON.stringify({ error: 'wabaId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Nunca usar o access token do projeto para uma WABA arbitrária do chamador.
    if (configuredWabaId && wabaId !== configuredWabaId) {
      return new Response(JSON.stringify({ error: 'wabaId not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const url = `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`

    if (action === 'check') {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      const data = await response.json()
      return new Response(JSON.stringify({ data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'subscribe') {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      const data = await response.json()
      return new Response(JSON.stringify({ data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
