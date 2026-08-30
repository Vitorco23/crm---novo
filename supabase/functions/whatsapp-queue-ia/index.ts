// WhatsApp Queue IA — trava a fila diária de até 25 leads pro follow-up
// manual via WhatsApp pessoal (DDD 79). Roda só na janela fixa de fim de
// dia (18h+ horário de Brasília) — o client decide QUANDO chamar
// (shouldGenerateNewQueue em whatsappQueue.ts); esta function só executa
// a decisão de QUAIS leads entram, uma vez, sem re-avaliação em tempo real.
//
// Mesma persona "Diretor Comercial" e mesmo modelo (GPT-5.4-mini, task
// priority_leads) já usado em priority-leads-ia — reaproveitado de
// propósito, não uma IA nova. O sinal de conteúdo da ligação (CallAuditData
// e autoDiagnosis, já produzidos pelo Gemini em auditor_ligacao/
// auto_diagnosis) já vem pronto no payload de candidatos; esta function não
// analisa ligação nenhuma, só decide e ordena.

import { callAI } from "../_shared/ai-router.ts";
import { requireUser } from "../_shared/require-auth.ts";
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  sanitizeExternal,
} from "../_shared/untrusted-input.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ITEMS = 25;

const SYSTEM_PROMPT = `Você é o Diretor Comercial da Performance21 decidindo a fila de WhatsApp do
número pessoal do vendedor para HOJE.

Contexto crítico: esse número é pessoal, já tem reputação a proteger, e o
teto é de no máximo ${MAX_ITEMS} contatos únicos por dia — não negociável.
Você está escolhendo QUEM entra nessa lista entre os candidatos abaixo
(que já passaram por um pré-filtro), classificando cada um numa faixa de
1 (mais urgente) a 5 (menos urgente):

1. Decisor confirmado com sinal de interesse real na ligação — prioridade máxima.
2. Reunião marcada mas ainda sem confirmação — urgência de negócio real.
3. No-show recente, ainda dentro da janela de recuperação.
4. Ligação sem atender, 1ª tentativa de hoje — contato "morno", vale abertura.
5. Ligação sem atender, 2ª+ tentativa sem resposta hoje — menor prioridade.

REGRA MAIS IMPORTANTE: a faixa (1-5) é só um ponto de partida. Dentro de
cada faixa, e entre leads na mesma etapa, você DEVE reordenar usando o
conteúdo real da ligação (campo "resumoLigacao" e "principalObjecao"), não
só a etapa/outcome:
- Promova quem demonstrou interesse explícito, urgência, dor reconhecida,
  ou já passou dados que indicam engajamento real (nome de decisor, dados
  da operação).
- Objeções que soam contornáveis ("sem tempo essa semana") pesam menos
  contra o lead do que desinteresse real ou ligação claramente negativa.
- NUNCA promova um lead cujo resumo indique ligação curta, sem engajamento,
  ou claramente negativa — mesmo que a etapa/outcome pareça favorável.
- Sem informação de conteúdo suficiente, use só os sinais estruturados
  (score, tendência, probabilidade) sem inventar interpretação.

Para cada lead escolhido, sugira também qual das mensagens de WhatsApp
prontas (lista "MENSAGENS DISPONÍVEIS" abaixo, por id) melhor se encaixa no
que aconteceu na ligação. Se nenhuma se encaixar bem, devolva mensagemId null.

NUNCA invente dado que não esteja no candidato. Se um candidato claramente
não merece contato hoje (ligação negativa, já resolvido, etc.), não o inclua.

RESPONDA EXCLUSIVAMENTE COM JSON VÁLIDO no formato:
{
  "items": [
    { "leadId": string, "tier": 1|2|3|4|5, "motivo": string (até 200 caracteres, cite o fato concreto), "mensagemId": string | null }
  ]
}

Ordene por prioridade real (não só pela faixa numérica) do primeiro ao
último. Máximo ${MAX_ITEMS} itens — pode devolver menos se não houver ${MAX_ITEMS} leads que mereçam contato hoje.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const candidates = body?.candidates;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(
        JSON.stringify({ items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messagesBlock = messages.length
      ? "MENSAGENS DISPONÍVEIS (id — rótulo):\n" +
        messages.map((m: { id: string; label: string }) => `- ${m.id} — ${m.label}`).join("\n")
      : "MENSAGENS DISPONÍVEIS: nenhuma — sempre devolva mensagemId null.";

    const candidatesSafe = sanitizeExternal(JSON.stringify(candidates), 90000);
    const userPrompt =
      `Data/hora atual: ${new Date().toISOString()}\n` +
      `Total de candidatos: ${candidates.length}\n\n` +
      messagesBlock + "\n\n" +
      wrapUntrusted(candidatesSafe, { maxChars: 90000, label: "CANDIDATOS (JSON)" }) + "\n\n" +
      `Escolha e ordene a fila de até ${MAX_ITEMS} contatos de hoje no formato JSON descrito.`;

    let result;
    try {
      result = await callAI({
        task: "priority_leads",
        system: SYSTEM_PROMPT + "\n\n" + UNTRUSTED_INPUT_SYSTEM_CLAUSE,
        user: userPrompt,
        json: true,
        temperature: 0.2,
        maxTokens: 2200,
        forceComplex: candidates.length > 25,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 502;
      const friendly =
        status === 429 ? "Limite de requisições atingido. Tente em instantes."
        : status === 402 ? "Créditos de IA esgotados."
        : "Não foi possível calcular a fila de WhatsApp agora.";
      return new Response(
        JSON.stringify({ error: friendly }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch {
      const m = String(result.content).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    const candIds = new Set(candidates.map((c: { id: string }) => String(c.id)));
    const messageIds = new Set(messages.map((m: { id: string }) => m.id));
    const raw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = raw
      .filter((x: any) => x && candIds.has(String(x.leadId)))
      .slice(0, MAX_ITEMS)
      .map((x: any) => ({
        leadId: String(x.leadId),
        tier: [1, 2, 3, 4, 5].includes(x.tier) ? x.tier : 5,
        motivo: String(x.motivo || "").slice(0, 240),
        mensagemId: typeof x.mensagemId === "string" && messageIds.has(x.mensagemId) ? x.mensagemId : null,
      }));

    return new Response(
      JSON.stringify({ items, model: result.modelUsed, generatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(JSON.stringify({ evt: "whatsapp_queue_error", msg: (e as Error).message }));
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
