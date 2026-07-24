// Auditor Comercial — usa AI Router (task: auditor_ligacao).
// Escolhe automaticamente entre tiers Gemini por tamanho do input; fallback GPT.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callAI } from '../_shared/ai-router.ts';

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

    // AI Router escolhe automaticamente o modelo pelo tamanho do input.
    const inputChars = callSummary.length + (body.leadHistory?.length ?? 0);

    let result;
    try {
      result = await callAI({
        task: 'auditor_ligacao',
        system: SYSTEM_PROMPT,
        user: userPrompt,
        inputChars,
        json: true,
        temperature: 0.3,
        maxTokens: 8192,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      const friendly =
        status === 429
          ? 'Limite de requisições atingido. Tente novamente em instantes.'
          : status === 402
          ? 'Créditos de IA esgotados. Adicione créditos nas configurações do workspace.'
          : 'Não foi possível gerar a análise neste momento. Tente novamente em instantes.';
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const jsonText = (result.content || '').trim();
    if (!jsonText) {
      return new Response(JSON.stringify({ error: 'Resposta vazia da IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonText);
    } catch {
      const m = jsonText.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          data = JSON.parse(m[0]);
        } catch (e2) {
          console.error('JSON parse failed:', e2, jsonText.slice(0, 500));
          return new Response(JSON.stringify({ error: 'Formato inválido da IA', raw: jsonText.slice(0, 1000) }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Formato inválido da IA', raw: jsonText.slice(0, 1000) }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const temperature = (data.temperatura as string) === 'Quente' || (data.temperatura as string) === 'Frio'
      ? data.temperatura as 'Quente' | 'Frio'
      : 'Morno';

    return new Response(JSON.stringify({
      data,
      temperature,
      generatedAt: new Date().toISOString(),
      model: result.modelUsed,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analyze-call-note error:', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
