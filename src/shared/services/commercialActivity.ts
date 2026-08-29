// ============================================================================
// COMMERCIAL ACTIVITY — camada de interpretação/agregação sobre o
// activityLedger (bruto) + Meetings. NÃO substitui o activityLedger: ele
// continua sendo o ledger de eventos e deduplicação primária (por
// `externalKey`/eco de escrita). Este módulo lê o ledger bruto diretamente
// (`getActivityLedger()`, não `summarizeActivity()`) e aplica as regras de
// negócio aprovadas no Sprint 2A para expor os números OFICIAIS de:
//   • ligações realizadas
//   • conexões
//   • decisores
//   • reuniões agendadas hoje vs. reuniões que acontecem hoje
//
// Independente da Missão do Dia — feito para ser consumido por Cold Call,
// Performance, Métricas e uma futura camada de contexto/IA. Nenhum módulo
// existente foi religado a esta camada neste sprint: ColdCallOpsPanel e
// missionPlanner continuam exibindo exatamente os números de antes até uma
// decisão explícita de trocar a fonte visível.
//
// Dados legados: antes deste sprint, `source: "attempt"` nunca era gravado
// no ledger (rejeitado na escrita) — não existem linhas antigas de tentativa
// de cadência para reinterpretar. "Conexão"/"decisor" não têm fallback
// automático aqui para Pomodoro: por decisão do Sprint 2A, esse fallback é
// responsabilidade de quem for exibir o número (não deste módulo), já que
// misturar os dois dentro da mesma função esconderia qual fonte gerou o
// resultado.
//
// Dedupe CallFace × cadence_attempt: correlação EXPLÍCITA por identificador
// (`relatedExternalKey`), decidida no momento do submit por
// `ConcluirTentativaDialog` via `findCorrelatedCallfaceInteraction()` — não
// mais por uma janela genérica de tempo lida aqui. Sem vínculo explícito,
// a tentativa conta normalmente: preferimos contar uma duplicata rara a
// esconder uma ligação real.
// ============================================================================

import { getActivityLedger, type ActivityEvent, type CadenceOutcome } from "@/shared/services/activityLedger";
import { getMeetings, type Meeting } from "@/shared/services/store";

/** Outcomes do canal Ligação onde a tentativa em si é inequívoca (não precisa
 * de confirmação adicional de `attemptPerformed`). */
const UNAMBIGUOUS_ATTEMPT_OUTCOMES = new Set<CadenceOutcome>([
  "sem_resposta", "caixa_postal", "respondeu_interesse", "sem_interesse", "pediu_retorno", "agendou",
]);

/** Outcomes ambíguos: só contam como tentativa real com `attemptPerformed: true` explícito. */
const AMBIGUOUS_ATTEMPT_OUTCOMES = new Set<CadenceOutcome>(["contato_invalido", "outro"]);

/** Outcomes do canal Ligação que já provam conexão por si só. */
const CONNECTED_OUTCOMES = new Set<CadenceOutcome>(["respondeu_interesse", "sem_interesse", "pediu_retorno", "agendou"]);

/** Janela máxima para correlacionar uma conclusão manual de cadência à
 * Interaction CallFace correspondente do MESMO lead — nunca a de outro lead,
 * nunca por texto. Ver `findCorrelatedCallfaceInteraction`. */
const CORRELATION_WINDOW_MS = 10 * 60 * 1000;

function inRange(iso: string | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
}

/** Uma "ligação realizada" verificável — ver definição aprovada do Sprint 2A. */
function isCallPerformed(e: ActivityEvent): boolean {
  if (e.channel !== "call") return false;
  if (e.source === "callface") return true;
  if (e.source === "cadence_attempt" && e.outcome) {
    if (UNAMBIGUOUS_ATTEMPT_OUTCOMES.has(e.outcome)) return true;
    if (AMBIGUOUS_ATTEMPT_OUTCOMES.has(e.outcome)) return e.attemptPerformed === true;
  }
  return false;
}

/** Uma "conexão" — só a partir de outcomes estruturados de cadência. CallFace
 * NÃO é tratado aqui como conexão automática: o payload de origem inclui um
 * `callStatus` cujo significado não foi confirmado neste sprint (ver ressalva
 * na entrega). Tratar isso é uma decisão pendente, não uma suposição. */
function isConnected(e: ActivityEvent): boolean {
  if (e.source !== "cadence_attempt" || !isCallPerformed(e)) return false;
  if (e.outcome && CONNECTED_OUTCOMES.has(e.outcome)) return true;
  if (e.outcome === "outro") return e.connected === true;
  return false;
}

/** Forma mínima que `ConcluirTentativaDialog` já tem em mãos — evita
 * importar o tipo `Interaction` completo aqui. */
export interface CallfaceInteractionRef {
  id: string;
  date?: string;
  createdAt?: string;
}

/**
 * Sprint 2A — correlação EXPLÍCITA, chamada por `ConcluirTentativaDialog` no
 * momento do submit (canal Ligação). Retorna o `id` da Interaction CallFace
 * (== `externalKey` do evento correspondente no ledger, ex.: `inbound:<row.id>`)
 * a usar como `relatedExternalKey`, ou `undefined` quando não há correlação
 * segura — nesse caso o chamador grava a tentativa normalmente, sem vínculo.
 *
 * Regras, todas obrigatórias:
 *  1. Só considera interações do PRÓPRIO lead (`interactions` já vem
 *     escopado ao lead — nunca busca em outro lead).
 *  2. Só considera interações realmente originadas do CallFace/inbound —
 *     identificado estruturalmente pelo prefixo `id.startsWith("inbound:")`
 *     (o mesmo formato usado como `externalKey` na sincronização), nunca por
 *     texto da nota/resumo.
 *  3. Só considera interações dentro de `CORRELATION_WINDOW_MS` (10min) da
 *     conclusão da tentativa.
 *  4. Nunca reutiliza uma interação já vinculada a outro `cadence_attempt`
 *     existente no ledger.
 *  5. Entre as elegíveis, escolhe a mais próxima no tempo.
 */
export function findCorrelatedCallfaceInteraction(
  interactions: CallfaceInteractionRef[] | undefined,
  atISO: string,
): string | undefined {
  const at = new Date(atISO).getTime();
  if (!interactions?.length || !Number.isFinite(at)) return undefined;

  const alreadyLinked = new Set(
    getActivityLedger()
      .filter((e) => e.source === "cadence_attempt" && e.relatedExternalKey)
      .map((e) => e.relatedExternalKey as string),
  );

  let best: { id: string; diff: number } | null = null;
  for (const i of interactions) {
    if (!i.id?.startsWith("inbound:")) continue;
    if (alreadyLinked.has(i.id)) continue;
    const t = new Date(i.date || i.createdAt || "").getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(at - t);
    if (diff > CORRELATION_WINDOW_MS) continue;
    if (!best || diff < best.diff) best = { id: i.id, diff };
  }
  return best?.id;
}

export interface CommercialActivityTotals {
  /** Ligações realizadas (CallFace confirmado + cadência com tentativa comprovada, deduplicado). */
  calls: number;
  /** Conexões (conversa real) — só a partir de outcomes estruturados de cadência. */
  connections: number;
  /** Falou com decisor — só dados estruturados novos; sem fallback automático para Pomodoro aqui. */
  decisionMakers: number;
  /** Reuniões cujo Meeting.createdAt cai no período — "geradas/agendadas hoje". */
  meetingsScheduled: number;
  /** Reuniões cujo Meeting.date/time cai no período — "acontecem hoje". Nunca somado com o acima. */
  meetingsOccurring: number;
}

export function computeCommercialActivity(from: Date, to: Date): CommercialActivityTotals {
  const events = getActivityLedger().filter((e) => inRange(e.at, from, to));

  const callfaceEvents = events.filter((e) => e.channel === "call" && e.source === "callface");
  const cadenceCallEvents = events.filter((e) => e.channel === "call" && e.source === "cadence_attempt" && isCallPerformed(e));

  // Dedupe: só suprime uma conclusão de cadência quando ela carrega um vínculo
  // EXPLÍCITO (`relatedExternalKey`, gravado por `findCorrelatedCallfaceInteraction`
  // no momento do submit) E o evento CallFace referenciado está de fato neste
  // período. Sem vínculo — inclusive quando duas ligações reais aconteceram
  // perto uma da outra — cada uma conta normalmente.
  const callfaceKeysInRange = new Set(callfaceEvents.map((e) => e.externalKey).filter((k): k is string => !!k));
  const dedupedCadenceCalls = cadenceCallEvents.filter(
    (e) => !(e.relatedExternalKey && callfaceKeysInRange.has(e.relatedExternalKey)),
  );

  const calls = callfaceEvents.length + dedupedCadenceCalls.length;
  const connections = dedupedCadenceCalls.filter(isConnected).length;
  const decisionMakers = dedupedCadenceCalls.filter((e) => e.talkedTo === "decisor").length;

  const meetings = getMeetings();
  const meetingsScheduled = meetings.filter((m) => inRange(m.createdAt, from, to)).length;
  const meetingsOccurring = meetings.filter((m: Meeting) => inRange(`${m.date}T${(m.time || "00:00")}:00`, from, to)).length;

  return { calls, connections, decisionMakers, meetingsScheduled, meetingsOccurring };
}
