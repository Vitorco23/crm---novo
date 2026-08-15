// ===== Activity Ledger =====
// Registro das atividades comerciais e reconciliação determinística de
// duplicidades.
//
// Causa-raiz do problema histórico (≈60 ligações reais viravam ≈200):
// a MESMA ligação era gravada até 4 vezes — inbound Matteline/CallFace,
// movimentação de card, conclusão de tentativa e interação manual — e a
// deduplicação acontecia apenas no momento da escrita, com janela fixa de
// 60 min e promoção entre canais (que também fundia ligações reais distintas).
//
// Nova arquitetura:
//  • ESCRITA é crua e idempotente: guardamos o evento como veio, sem promoções.
//    A única rejeição na escrita é a identidade primária (`externalKey`) e a
//    movimentação de card no canal "call" (nunca é ligação — regra 4).
//  • LEITURA reconcilia: `summarizeActivity` aplica a regra canônica sobre os
//    eventos do período, inclusive sobre registros legados já persistidos,
//    sem apagar nada e sem migração de banco.
//
// Regra canônica de ligação:
//  1. Fonte canônica/CONFIRMADA = inbound Matteline/CallFace (`source: callface`),
//     identidade primária `externalKey` (`inbound:<row.id>`), fallback `id`.
//     Dois inbounds distintos = duas ligações, mesmo no mesmo minuto.
//  2. Registro manual / tentativa concluída / nota = ESTIMADO. Só conta quando
//     não existe ligação confirmada correlacionável (mesmo lead, janela de
//     correlação) e não colide com outro estimado do mesmo lead na janela curta.
//  3. Movimentação de card nunca conta como ligação.
//  4. Reuniões são independentes e nunca deduplicadas contra ligações.

import { uload, usave } from "@/shared/services/userStorage";

export type ActivityChannel =
  | "call"
  | "message"
  | "email"
  | "followup"
  | "meeting"
  | "other";

export type ActivitySource =
  | "callface"
  | "interaction"
  | "attempt"
  | "movement"
  | "note"
  | "meeting";

export interface ActivityEvent {
  id: string;
  at: string; // ISO
  leadId?: string;
  channel: ActivityChannel;
  source: ActivitySource;
  /** Identidade primária quando existe (ex.: `inbound:<row.id>` da CallFace). */
  externalKey?: string;
}

const KEY = "p21_activity_ledger";
const MAX_ENTRIES = 20000;

/** Janela usada apenas como fallback de correlação (confirmado x estimado). */
export const CORRELATION_WINDOW_MS = 60 * 60 * 1000; // 60 min
/** Janela curta para colapsar registros estimados redundantes da mesma ação. */
export const ESTIMATED_MERGE_WINDOW_MS = 15 * 60 * 1000; // 15 min
/** Guarda contra double-submit exato na escrita. */
const WRITE_ECHO_WINDOW_MS = 5 * 1000;

/** Fontes que comprovam a atividade (confirmado). Para "call", só CallFace. */
function isConfirmed(e: Pick<ActivityEvent, "channel" | "source">): boolean {
  if (e.channel === "call") return e.source === "callface";
  if (e.channel === "meeting") return e.source === "meeting" || e.source === "interaction";
  return e.source === "callface" || e.source === "interaction";
}

export const CHANNEL_LABELS: Record<ActivityChannel, string> = {
  call: "Ligações",
  message: "WhatsApp / Mensagens",
  email: "E-mails",
  followup: "Follow-ups",
  meeting: "Reuniões",
  other: "Outros",
};

export const SOURCE_LABELS: Record<ActivitySource, string> = {
  callface: "CallFace",
  interaction: "manual",
  meeting: "agenda",
  attempt: "tentativa",
  note: "nota",
  movement: "movimentação",
};

export function getActivityLedger(): ActivityEvent[] {
  return uload<ActivityEvent[]>(KEY, []);
}

function save(all: ActivityEvent[]) {
  const trimmed = all.length > MAX_ENTRIES ? all.slice(all.length - MAX_ENTRIES) : all;
  usave(KEY, trimmed);
}

/** Normaliza rótulos livres de tipo de interação para um canal do ledger. */
export function channelFromLabel(raw?: string): ActivityChannel {
  const s = (raw || "").toLowerCase();
  if (!s) return "other";
  if (/(liga|call|telefone|cold)/.test(s)) return "call";
  if (/(whats|wpp|mensagem|sms|msg)/.test(s)) return "message";
  if (/(mail|e-mail)/.test(s)) return "email";
  if (/(follow)/.test(s)) return "followup";
  if (/(reuni|meeting|call de|demo)/.test(s)) return "meeting";
  return "other";
}

export interface RecordInput {
  leadId?: string;
  channel: ActivityChannel;
  source: ActivitySource;
  at?: string;
  externalKey?: string;
}

/**
 * Grava uma atividade crua. A deduplicação comercial acontece na leitura
 * (`summarizeActivity`). Retorna `true` quando um novo registro foi criado.
 */
export function recordActivity(input: RecordInput): boolean {
  const at = input.at ?? new Date().toISOString();
  const t = new Date(at).getTime();
  if (isNaN(t)) return false;

  // Regra 4: movimentação de card nunca é ligação.
  if (input.channel === "call" && input.source === "movement") return false;

  const all = getActivityLedger();

  // Identidade primária: reprocessar o mesmo inbound não cria nada novo.
  if (input.externalKey && all.some((e) => e.externalKey === input.externalKey)) {
    return false;
  }

  // Eco de escrita (mesmo lead/canal/fonte em poucos segundos).
  const echo = all.some(
    (e) =>
      e.channel === input.channel &&
      e.source === input.source &&
      (e.leadId || "") === (input.leadId || "") &&
      Math.abs(new Date(e.at).getTime() - t) < WRITE_ECHO_WINDOW_MS
  );
  if (echo) return false;

  all.push({
    id: crypto.randomUUID(),
    at,
    leadId: input.leadId,
    channel: input.channel,
    source: input.source,
    externalKey: input.externalKey,
  });
  save(all);
  return true;
}

export interface ActivitySummary {
  total: number;
  /** Total após reconciliação (confirmado + estimado). */
  byChannel: Record<ActivityChannel, number>;
  /** Comprovado por fonte canônica (CallFace / registro explícito). */
  confirmedByChannel: Record<ActivityChannel, number>;
  /** Inferido a partir de ações no CRM (tentativa, nota, movimentação). */
  estimatedByChannel: Record<ActivityChannel, number>;
  bySource: Record<ActivityChannel, Partial<Record<ActivitySource, number>>>;
  totalConfirmed: number;
  totalEstimated: number;
}

function emptyByChannel(): Record<ActivityChannel, number> {
  return { call: 0, message: 0, email: 0, followup: 0, meeting: 0, other: 0 };
}

/**
 * Aplica a regra canônica sobre um conjunto de eventos e devolve apenas os
 * registros que representam atividades reais distintas.
 */
export function reconcileActivity(events: ActivityEvent[]): ActivityEvent[] {
  // Identidade primária: mesmo externalKey = mesma atividade (dados legados).
  const seenKeys = new Set<string>();
  const unique = events.filter((e) => {
    if (!e.externalKey) return true;
    if (seenKeys.has(e.externalKey)) return false;
    seenKeys.add(e.externalKey);
    return true;
  });

  const sorted = [...unique].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  // Regra 4 aplicada também em leitura, para registros legados.
  const eligible = sorted.filter((e) => !(e.channel === "call" && e.source === "movement"));

  const confirmed = eligible.filter(isConfirmed);
  const accepted: ActivityEvent[] = [...confirmed];

  for (const e of eligible) {
    if (isConfirmed(e)) continue;
    const t = new Date(e.at).getTime();
    if (isNaN(t)) continue;

    if (e.leadId) {
      // Estimado é suprimido por atividade confirmada correlacionável.
      const hasConfirmed = confirmed.some(
        (c) =>
          c.channel === e.channel &&
          c.leadId === e.leadId &&
          Math.abs(new Date(c.at).getTime() - t) <= CORRELATION_WINDOW_MS
      );
      if (hasConfirmed) continue;

      // Estimados redundantes da mesma ação (tentativa + nota + movimentação).
      const dupEstimated = accepted.some(
        (a) =>
          !isConfirmed(a) &&
          a.channel === e.channel &&
          a.leadId === e.leadId &&
          Math.abs(new Date(a.at).getTime() - t) <= ESTIMATED_MERGE_WINDOW_MS
      );
      if (dupEstimated) continue;
    }

    accepted.push(e);
  }

  return accepted.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function summarizeActivity(from: Date, to: Date): ActivitySummary {
  const a = from.getTime();
  const b = to.getTime();

  const inRange = getActivityLedger().filter((e) => {
    const t = new Date(e.at).getTime();
    return !isNaN(t) && t >= a && t <= b;
  });

  const events = reconcileActivity(inRange);

  const byChannel = emptyByChannel();
  const confirmedByChannel = emptyByChannel();
  const estimatedByChannel = emptyByChannel();
  const bySource = {
    call: {}, message: {}, email: {}, followup: {}, meeting: {}, other: {},
  } as ActivitySummary["bySource"];
  let total = 0;
  let totalConfirmed = 0;
  let totalEstimated = 0;

  for (const e of events) {
    byChannel[e.channel] += 1;
    if (isConfirmed(e)) {
      confirmedByChannel[e.channel] += 1;
      totalConfirmed++;
    } else {
      estimatedByChannel[e.channel] += 1;
      totalEstimated++;
    }
    bySource[e.channel][e.source] = (bySource[e.channel][e.source] || 0) + 1;
    total++;
  }

  return { total, byChannel, confirmedByChannel, estimatedByChannel, bySource, totalConfirmed, totalEstimated };
}
