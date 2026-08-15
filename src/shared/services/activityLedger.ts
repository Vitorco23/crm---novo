// ===== Activity Ledger =====
// Armazena APENAS atividades comerciais confirmadas por uma fonte real e
// identificável. O CRM não estima mais contatos.
//
// Regras:
//  1. Fonte canônica de ligação = inbound Matteline/CallFace (`source: callface`),
//     identidade primária `externalKey` (`inbound:<row.id>`).
//     Dois inbounds distintos = duas ligações; o mesmo inbound reprocessado = uma.
//  2. Interações registradas explicitamente pelo usuário e reuniões efetivamente
//     registradas também são confirmadas.
//  3. Fontes inferidas (movimentação de card, tentativa concluída, nota) são
//     rejeitadas na escrita e ignoradas na leitura — permanecem nos tipos apenas
//     por compatibilidade com registros legados já persistidos.


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

/** Fontes inferidas — ignoradas em escrita, leitura, resumos e diagnósticos. */
export const INFERRED_SOURCES = new Set<ActivitySource>(["movement", "attempt", "note"]);

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

  // Estimativas foram removidas do produto: eventos inferidos (movimentação de
  // card, tentativa concluída, nota) não geram mais atividade comercial.
  if (INFERRED_SOURCES.has(input.source)) return false;

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
  /** Total confirmado por canal (única contagem existente). */
  byChannel: Record<ActivityChannel, number>;
  /** Comprovado por fonte canônica (CallFace / registro explícito). */
  confirmedByChannel: Record<ActivityChannel, number>;
  bySource: Record<ActivityChannel, Partial<Record<ActivitySource, number>>>;
  totalConfirmed: number;
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

  // Somente fontes confirmadas entram em qualquer contagem comercial.
  return unique
    .filter((e) => !INFERRED_SOURCES.has(e.source) && isConfirmed(e))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
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
  const bySource = {
    call: {}, message: {}, email: {}, followup: {}, meeting: {}, other: {},
  } as ActivitySummary["bySource"];
  let total = 0;
  let totalConfirmed = 0;

  for (const e of events) {
    byChannel[e.channel] += 1;
    confirmedByChannel[e.channel] += 1;
    totalConfirmed++;
    bySource[e.channel][e.source] = (bySource[e.channel][e.source] || 0) + 1;
    total++;
  }

  return { total, byChannel, confirmedByChannel, bySource, totalConfirmed };
}
