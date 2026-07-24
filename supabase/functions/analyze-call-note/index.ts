// Auditor Comercial 360º — analisa o CONTEXTO COMPLETO do lead, não apenas uma ligação.
// Considera: todas as ligações, tarefas concluídas/pendentes, movimentações,
// dados cadastrais, nicho, cidade, etapa, tentativas e histórico de eventos.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callAI } from '../_shared/ai-router.ts';

const SYSTEM_PROMPT = `Você é o AUDITOR COMERCIAL 360º da Performance21.

Você NÃO analisa apenas uma ligação isolada.
Você analisa o CONTEXTO COMPLETO do Lead: todas as ligações já realizadas, tarefas concluídas e pendentes, movimentações no pipeline, dados cadastrais (nicho, cidade, etapa, tentativas, ICP) e todo o histórico de eventos daquele Lead.

Sua missão é entender a EVOLUÇÃO do Lead ao longo do tempo — não apenas o que aconteceu na última ligação.

REGRAS ABSOLUTAS:
- Nunca invente informação. Use SOMENTE o contexto do Lead recebido.
- Nunca use informação de outros Leads (o payload contém apenas este Lead).
- Compare a ligação em análise com as ligações anteriores para avaliar tendência.
- Toda conclusão precisa apoiar-se em fato presente no histórico.
- Português (Brasil). Frases curtas. Bullets objetivos. Sem parágrafos longos.
- Cada bullet no máximo ~14 palavras.

PERGUNTAS QUE VOCÊ DEVE RESPONDER:
- O interesse do Lead aumentou ou diminuiu ao longo dos contatos?
- O Lead evoluiu desde o primeiro contato?
- Existe tendência clara de fechamento ou de perda?
- O vendedor está conduzindo corretamente o processo?
- Qual é o próximo passo mais eficaz agora?

SAÍDA: responda SOMENTE em JSON válido. Não escreva texto fora do JSON.

CAMPOS:
- temperatura: "Quente" | "Morno" | "Frio" — estado atual considerando TODO o histórico.
- tendencia: "Evoluindo" | "Esfriando" | "Estavel" — direção do Lead comparando contatos anteriores com o atual.
- tendenciaJustificativa: 1-2 linhas explicando a tendência com base em fatos do histórico (ex: "Na 1ª ligação apenas ouviu; na 2ª pediu proposta").
- scoreComercial: inteiro 0-100 (probabilidade global de fechamento).
- probabilidadeAvanco: "Baixa" | "Media" | "Alta".
- prioridade: "Baixa" | "Media" | "Alta".
- resumoExecutivo: até 4 linhas — situação atual do Lead considerando toda a jornada.
- evolucaoLead: 2-4 linhas descrevendo como o Lead evoluiu do primeiro contato até agora.
- objecoes: até 3 bullets — objeções recorrentes ao longo dos contatos.
- pontosPositivos: até 3 bullets — sinais positivos acumulados na jornada.
- pontosAtencao: até 3 bullets — riscos observados no conjunto das interações.
- oportunidadeComercial: até 3 bullets — argumentos com maior tração no histórico.
- feedbackVendedor: 2-4 linhas — avaliação de como o vendedor está conduzindo o Lead, com sugestão concreta.
- planoFollowup: 3-4 passos {quando, acao} coerentes com a tendência atual.
- recomendacaoEstrategica: até 3 linhas — jogada estratégica para este Lead específico.
- principalObjecao: string curta (ou "Nenhuma").
- proximaAcao: string curta e acionável.
- diasAteProximoFollowup: inteiro 0-30.
- dataProximoContato: data ISO (YYYY-MM-DD) coerente com diasAteProximoFollowup a partir de hoje.
- assuntosDeInteresse: até 5 tags curtas (temas que despertaram interesse ao longo dos contatos).`;

interface Payload {
  leadId?: string;
  noteId?: string;
  company?: string;
  niche?: string;
  stage?: string;
  attempt?: number;
  callSummary?: string;
  leadInfo?: string;
  allCallNotes?: string;
  tarefasConcluidas?: string;
  tarefasPendentes?: string;
  movimentacoes?: string;
  historicoEventos?: string;
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
      '',
      '========== DADOS CADASTRAIS DO LEAD ==========',
      body.leadInfo || `Empresa: ${body.company || 'N/D'}\nNicho: ${body.niche || 'N/D'}\nEtapa: ${body.stage || 'N/D'}`,
      '',
      '========== LIGAÇÃO EM ANÁLISE (última ação registrada) ==========',
      `Tentativa: ${body.attempt ?? 'N/D'}`,
      callSummary,
      '',
      '========== TODAS AS LIGAÇÕES DO LEAD (ordem cronológica) ==========',
      body.allCallNotes || '(apenas a ligação em análise)',
      '',
      '========== MOVIMENTAÇÕES NO PIPELINE ==========',
      body.movimentacoes || '(sem movimentações)',
      '',
      '========== TAREFAS CONCLUÍDAS ==========',
      body.tarefasConcluidas || '(nenhuma)',
      '',
      '========== TAREFAS PENDENTES ==========',
      body.tarefasPendentes || '(nenhuma)',
      '',
      '========== HISTÓRICO DE EVENTOS ==========',
      body.historicoEventos || '(vazio)',
      '',
      'Analise o CONTEXTO COMPLETO acima e devolva o JSON conforme o schema.',
    ].join('\n');

    const inputChars = userPrompt.length;

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
