// Auditor Comercial — dois modos:
// - "quick": análise leve apenas do último resumo (baixo custo em tokens).
// - "full": diagnóstico 360º usando todo o contexto do Lead.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callAI } from '../_shared/ai-router.ts';
import { buildMemoryContextBlock } from '../_shared/memory-retrieval.ts';
import { NBA_PROMPT_BLOCK, extractNBA, sanitizeNBA } from '../_shared/nba-types.ts';
import { buildBusinessCalendarBlock } from '../_shared/business-calendar.ts';
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  sanitizeExternal,
} from '../_shared/untrusted-input.ts';


const SYSTEM_QUICK = `Você é o AUDITOR COMERCIAL da Performance21 em modo ANÁLISE RÁPIDA.

Você recebe APENAS o resumo da última ligação (feito pela Matteline) e dados básicos do Lead.
Não invente informação que não esteja no resumo. Não suponha histórico anterior.

Objetivo: leitura rápida da última conversa, em segundos. Português (Brasil), frases curtas.

SAÍDA: JSON válido apenas, no schema abaixo.

CAMPOS:
- temperatura: "Quente" | "Morno" | "Frio" (baseado só na última conversa).
- tendencia: "Estavel" (sempre "Estavel" neste modo — não há histórico suficiente para inferir tendência).
- tendenciaJustificativa: "Análise rápida — sem comparação histórica."
- scoreComercial: inteiro 0-100.
- probabilidadeAvanco: "Baixa" | "Media" | "Alta".
- prioridade: "Baixa" | "Media" | "Alta".
- resumoExecutivo: até 3 linhas curtas.
- evolucaoLead: "" (vazio neste modo).
- objecoes: até 2 bullets.
- pontosPositivos: até 2 bullets.
- pontosAtencao: até 2 bullets.
- oportunidadeComercial: até 2 bullets.
- feedbackVendedor: 1-2 linhas objetivas.
- planoFollowup: 2 passos {quando, acao}.
- recomendacaoEstrategica: 1-2 linhas.
- principalObjecao: string curta ou "Nenhuma".
- proximaAcao: string curta e acionável.
- diasAteProximoFollowup: inteiro 0-30.
- dataProximoContato: data ISO (YYYY-MM-DD) coerente.
- assuntosDeInteresse: até 3 tags curtas.`;

const SYSTEM_FULL = `Você é o AUDITOR COMERCIAL 360º da Performance21 em modo DIAGNÓSTICO COMPLETO.

Você analisa o CONTEXTO COMPLETO do Lead: todas as ligações já realizadas, tarefas concluídas e pendentes, movimentações no pipeline, dados cadastrais (nicho, cidade, etapa, tentativas, ICP) e todo o histórico de eventos daquele Lead.

Sua missão é entender a EVOLUÇÃO do Lead ao longo do tempo.

REGRAS ABSOLUTAS:
- Nunca invente informação. Use SOMENTE o contexto do Lead recebido.
- Nunca use informação de outros Leads.
- Compare a ligação em análise com as ligações anteriores para avaliar tendência.
- Toda conclusão precisa apoiar-se em fato presente no histórico.
- Português (Brasil). Frases curtas. Cada bullet no máximo ~14 palavras.

RESPONDA:
- O interesse aumentou ou diminuiu? O Lead evoluiu? Há tendência de fechamento ou de perda?
- O vendedor está conduzindo corretamente? Qual o próximo passo mais eficaz?

SAÍDA: JSON válido apenas.

CAMPOS:
- temperatura: "Quente" | "Morno" | "Frio".
- tendencia: "Evoluindo" | "Esfriando" | "Estavel".
- tendenciaJustificativa: 1-2 linhas com fatos do histórico.
- scoreComercial: 0-100.
- probabilidadeAvanco: "Baixa" | "Media" | "Alta".
- prioridade: "Baixa" | "Media" | "Alta".
- resumoExecutivo: até 4 linhas.
- evolucaoLead: 2-4 linhas descrevendo a jornada.
- objecoes: até 3 bullets.
- pontosPositivos: até 3 bullets.
- pontosAtencao: até 3 bullets.
- oportunidadeComercial: até 3 bullets.
- feedbackVendedor: 2-4 linhas com sugestão concreta.
- planoFollowup: 3-4 passos {quando, acao}.
- recomendacaoEstrategica: até 3 linhas.
- principalObjecao: string curta ou "Nenhuma".
- proximaAcao: string curta.
- diasAteProximoFollowup: 0-30.
- dataProximoContato: YYYY-MM-DD.
- assuntosDeInteresse: até 5 tags.`;

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
  interacoesComerciais?: string;
  tarefasConcluidas?: string;
  tarefasPendentes?: string;
  movimentacoes?: string;
  historicoEventos?: string;
  mode?: "quick" | "full";

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

    const mode: "quick" | "full" = body.mode === "full" ? "full" : "quick";
    const today = new Date().toISOString().slice(0, 10);

    const { block: memoryBlock } = await buildMemoryContextBlock({
      queryText: `${body.company || ""} ${body.niche || ""} ${body.stage || ""}\n${callSummary}`.slice(0, 3000),
      niche: body.niche || null,
      matchCount: 5,
      minSimilarity: 0.5,
      includePatterns: true,
    });

    const calendarBlock = buildBusinessCalendarBlock();
    const userPrompt = mode === "quick"
      ? [
          `Data de hoje: ${today}`,
          '',
          calendarBlock,
          '',
          memoryBlock,
          '',
          '========== DADOS BÁSICOS DO LEAD ==========',
          body.leadInfo || `Empresa: ${body.company || 'N/D'}\nNicho: ${body.niche || 'N/D'}\nEtapa: ${body.stage || 'N/D'}`,
          '',
          '========== ÚLTIMO RESUMO DE LIGAÇÃO (Matteline) ==========',
          `Tentativa: ${body.attempt ?? 'N/D'}`,
          callSummary,
          '',
          'Faça a análise RÁPIDA e devolva o JSON.',
        ].filter(Boolean).join('\n')
      : [
          `Data de hoje: ${today}`,
          '',
          calendarBlock,
          '',
          memoryBlock,
          '',
          '========== DADOS CADASTRAIS DO LEAD ==========',
          body.leadInfo || `Empresa: ${body.company || 'N/D'}\nNicho: ${body.niche || 'N/D'}\nEtapa: ${body.stage || 'N/D'}`,
          '',
          '========== LIGAÇÃO EM ANÁLISE ==========',
          `Tentativa: ${body.attempt ?? 'N/D'}`,
          callSummary,
          '',
          '========== TODAS AS LIGAÇÕES DO LEAD (ordem cronológica) ==========',
          body.allCallNotes || '(apenas a ligação em análise)',
          '',
          '========== INTERAÇÕES COMERCIAIS (timeline completa: reuniões, follow-ups, WhatsApp, e-mail, propostas, visitas etc.) ==========',
          body.interacoesComerciais || '(nenhuma interação registrada)',
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
          'Analise o CONTEXTO COMPLETO acima e devolva o JSON.',
        ].filter(Boolean).join('\n');

    const inputChars = userPrompt.length;

    let result;
    try {
      result = await callAI({
        task: 'auditor_ligacao',
        system: (mode === "quick" ? SYSTEM_QUICK : SYSTEM_FULL) + "\n\n" + NBA_PROMPT_BLOCK,
        user: userPrompt,
        inputChars,
        // Modo quick usa tier menor; modo full força tier mais capaz.
        forceComplex: mode === "full",
        json: true,
        temperature: 0.3,
        maxTokens: mode === "quick" ? 2048 : 8192,
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

    (data as Record<string, unknown>).mode = mode;

    const temperature = (data.temperatura as string) === 'Quente' || (data.temperatura as string) === 'Frio'
      ? data.temperatura as 'Quente' | 'Frio'
      : 'Morno';

    // ---- Próxima Melhor Ação (NBA) — extração + guard-rails
    const rawNBA = extractNBA(data);
    const nba = sanitizeNBA(rawNBA, {
      stage: body.stage,
      hasDiagnosis: mode === "full",
      interactionsCount: (body.interacoesComerciais || "").length > 20 ? 1 : 0,
      callNotesCount: (body.allCallNotes || callSummary).length > 20 ? 1 : 0,
    }, body.leadId);
    (data as Record<string, unknown>).nextBestAction = nba;

    return new Response(JSON.stringify({
      data,
      temperature,
      mode,
      nextBestAction: nba,
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
