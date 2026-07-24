import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `Você é um especialista em vendas consultivas B2B analisando o resumo de UMA ligação comercial já resumido pela Matteline.

REGRAS ABSOLUTAS:
- Nunca invente informação. Use SOMENTE o resumo recebido e o histórico do lead.
- NÃO resuma a ligação novamente — o resumo já existe.
- Sua função é INTERPRETAR comercialmente o resumo e produzir um parecer.
- Justifique cada recomendação com trechos/fatos presentes no resumo.
- Seja objetivo, consultivo e orientado à tomada de decisão.
- Responda SEMPRE em português (Brasil) e SEMPRE nesta estrutura Markdown exata:

## Parecer Comercial

**Temperatura do Lead:** Quente | Morno | Frio

### Interesse percebido
(descreva o nível de interesse demonstrado pelo cliente)

### Principais objeções
- (liste objetivamente as objeções identificadas; se não houver, escreva "Nenhuma objeção clara identificada")

### Pontos positivos
- (destaque aspectos positivos da conversa)

### Pontos de atenção
- (aponte riscos percebidos)

### Próxima ação recomendada
(sugira qual deve ser o próximo passo comercial)

### Sugestão estratégica
(orientação prática para aumentar chances de conversão na próxima abordagem)

IMPORTANTE: A linha "Temperatura do Lead:" deve conter exatamente uma dessas três palavras: Quente, Morno ou Frio.`;

interface Payload {
  leadId?: string;
  noteId?: string;
  company?: string;
  niche?: string;
  stage?: string;
  attempt?: number;
  callSummary?: string;
  leadHistory?: string;
}

function extractTemperature(md: string): "Quente" | "Morno" | "Frio" {
  const m = md.match(/Temperatura do Lead[^\n]*?(Quente|Morno|Frio)/i);
  if (!m) return "Morno";
  const v = m[1].toLowerCase();
  if (v === "quente") return "Quente";
  if (v === "frio") return "Frio";
  return "Morno";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Payload;
    const callSummary = (body.callSummary || '').trim();
    if (!callSummary) {
      return new Response(JSON.stringify({ error: 'callSummary is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = [
      `Empresa: ${body.company || 'N/D'}`,
      `Nicho: ${body.niche || 'N/D'}`,
      `Etapa atual: ${body.stage || 'N/D'}`,
      `Tentativa atual: ${body.attempt ?? 'N/D'}`,
      '',
      '--- RESUMO DA LIGAÇÃO (produzido pela Matteline) ---',
      callSummary,
      '',
      body.leadHistory
        ? `--- HISTÓRICO RESUMIDO DO LEAD ---\n${body.leadHistory}`
        : '--- HISTÓRICO RESUMIDO DO LEAD ---\n(sem interações anteriores registradas)',
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`Gemini failed [${resp.status}]:`, errBody);
      return new Response(
        JSON.stringify({ error: 'Gemini request failed', status: resp.status, details: errBody }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await resp.json();
    const markdown = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!markdown.trim()) {
      return new Response(JSON.stringify({ error: 'Empty response from Gemini' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const temperature = extractTemperature(markdown);
    return new Response(JSON.stringify({
      markdown,
      temperature,
      generatedAt: new Date().toISOString(),
      model: GEMINI_MODEL,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analyze-call-note error:', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
