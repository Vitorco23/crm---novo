import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `Você é o AUDITOR COMERCIAL da Performance21, analisando o resumo de UMA ligação comercial produzido pela Matteline.

REGRAS ABSOLUTAS:
- Nunca invente informação. Use SOMENTE o resumo recebido e o histórico do lead.
- NÃO resuma novamente a ligação — interprete comercialmente o que aconteceu.
- Toda recomendação deve ter justificativa baseada na conversa.
- Português (Brasil). Frases curtas. Bullets objetivos. Sem parágrafos longos.
- Não repita a mesma ideia em seções diferentes.
- Cada bullet no máximo ~12 palavras.

OBJETIVO:
Transformar a ligação em uma ferramenta operacional: veredito rápido, oportunidades claras, feedback prático e próximo passo definido. O vendedor deve entender tudo em menos de 30 segundos.

SAÍDA: responda SOMENTE em JSON válido no schema fornecido. Não escreva texto fora do JSON.

CAMPOS:
- temperatura: "Quente" | "Morno" | "Frio"
- scoreComercial: inteiro 0-100 (probabilidade de avanço)
- probabilidadeAvanco: "Baixa" | "Media" | "Alta"
- prioridade: "Baixa" | "Media" | "Alta"
- resumoExecutivo: até 4 linhas curtas (o que aconteceu, interesse do cliente, próximo passo)
- objecoes: até 3 bullets curtos
- pontosPositivos: até 3 bullets (fatores que aumentam conversão)
- pontosAtencao: até 3 bullets (riscos que impedem avanço)
- oportunidadeComercial: até 3 bullets (argumentos que despertaram interesse)
- feedbackVendedor: 2-4 linhas, prático, sem crítica genérica, com sugestão concreta
- planoFollowup: 3-4 passos objetivos, cada um com {quando, acao} (ex: "Hoje" / "Em 2 dias")
- recomendacaoEstrategica: até 3 linhas, uma recomendação prática
- principalObjecao: string curta (ou "Nenhuma")
- proximaAcao: string curta e acionável
- diasAteProximoFollowup: inteiro 0-30
- dataProximoContato: data ISO (YYYY-MM-DD) coerente com diasAteProximoFollowup a partir da data atual
- assuntosDeInteresse: até 5 tags curtas`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    temperatura: { type: "string", enum: ["Quente", "Morno", "Frio"] },
    scoreComercial: { type: "integer", minimum: 0, maximum: 100 },
    probabilidadeAvanco: { type: "string", enum: ["Baixa", "Media", "Alta"] },
    prioridade: { type: "string", enum: ["Baixa", "Media", "Alta"] },
    resumoExecutivo: { type: "string" },
    objecoes: { type: "array", items: { type: "string" } },
    pontosPositivos: { type: "array", items: { type: "string" } },
    pontosAtencao: { type: "array", items: { type: "string" } },
    oportunidadeComercial: { type: "array", items: { type: "string" } },
    feedbackVendedor: { type: "string" },
    planoFollowup: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quando: { type: "string" },
          acao: { type: "string" },
        },
        required: ["quando", "acao"],
      },
    },
    recomendacaoEstrategica: { type: "string" },
    principalObjecao: { type: "string" },
    proximaAcao: { type: "string" },
    diasAteProximoFollowup: { type: "integer", minimum: 0, maximum: 30 },
    dataProximoContato: { type: "string" },
    assuntosDeInteresse: { type: "array", items: { type: "string" } },
  },
  required: [
    "temperatura", "scoreComercial", "probabilidadeAvanco", "prioridade",
    "resumoExecutivo", "objecoes", "pontosPositivos", "pontosAtencao",
    "oportunidadeComercial", "feedbackVendedor", "planoFollowup",
    "recomendacaoEstrategica", "principalObjecao", "proximaAcao",
    "diasAteProximoFollowup", "dataProximoContato", "assuntosDeInteresse",
  ],
};

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

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = [
      `Data de hoje: ${today}`,
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
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
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

    const raw = await resp.json();
    const jsonText = raw?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!jsonText.trim()) {
      return new Response(JSON.stringify({ error: 'Empty response from Gemini' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      console.error('JSON parse failed:', e, jsonText.slice(0, 500));
      return new Response(JSON.stringify({ error: 'Invalid JSON from Gemini', raw: jsonText.slice(0, 1000) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const temperature = (data.temperatura as string) === 'Quente' || (data.temperatura as string) === 'Frio'
      ? data.temperatura as 'Quente' | 'Frio'
      : 'Morno';

    return new Response(JSON.stringify({
      data,
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
