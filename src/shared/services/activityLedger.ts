// ===== Activity Ledger =====
// Registro automático (estimado) das atividades comerciais do dia.
// Alimentado pelo eventWiring e pela drenagem da CallFace/Matteline.
//
// Regra central: cada atividade é identificada por `lead + canal + janela de
// tempo`. Duas ações do mesmo canal no mesmo lead dentro da janela contam UMA
// vez. Se chega uma fonte mais confiável dentro da janela, o registro é
// promovido (a fonte é atualizada) em vez de duplicar.

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
  /** Chave estável opcional (ex.: id da linha da fila da CallFace). */
  externalKey?: string;
}

const KEY = "p21_activity_ledger";
const MAX_ENTRIES = 20000;
export const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 60 minutos

// Prioridade: maior número vence (fonte mais confiável).
const SOURCE_PRIORITY: Record<ActivitySource, number> = {
  callface: 5,
  interaction: 4,
  meeting: 4,
  attempt: 3,
  note: 2,
  movement: 1,
};

// Fontes inferidas pelo sistema (baixa confiança) x fontes explícitas do usuário/CallFace.
const INFERRED_SOURCES: ActivitySource[] = ["movement", "note"];
const isExplicit = (s: ActivitySource) => !INFERRED_SOURCES.includes(s);

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
 * Grava uma atividade aplicando dedupe por lead+canal+janela e promoção de
 * fonte. Retorna `true` quando um novo registro foi criado.
 */
export function recordActivity(input: RecordInput): boolean {
  const at = input.at ?? new Date().toISOString();
  const t = new Date(at).getTime();
  if (isNaN(t)) return false;

  const all = getActivityLedger();

  // Idempotência por chave externa (ex.: linha da fila da CallFace).
  if (input.externalKey && all.some((e) => e.externalKey === input.externalKey)) {
    return false;
  }

  const inWindow = (e: ActivityEvent) =>
    !!e.leadId &&
    (e.leadId || "") === (input.leadId || "") &&
    Math.abs(new Date(e.at).getTime() - t) < DEDUPE_WINDOW_MS;

  // ===== Prioridade entre canais =====
  // CallFace / registro manual > movimentação inferida.
  if (input.leadId) {
    if (isExplicit(input.source)) {
      // Um registro explícito absorve um registro inferido do mesmo lead,
      // mesmo que o canal seja diferente (ex.: movi o card e depois registrei WhatsApp).
      const inferredIdx = all.findIndex((e) => inWindow(e) && !isExplicit(e.source));
      if (inferredIdx >= 0) {
        all[inferredIdx] = {
          ...all[inferredIdx],
          channel: input.channel,
          source: input.source,
          at,
          externalKey: input.externalKey ?? all[inferredIdx].externalKey,
        };
        save(all);
        return false;
      }
    } else {
      // Movimentação/nota não cria nada se já existe ação explícita na janela.
      if (all.some((e) => inWindow(e) && isExplicit(e.source))) return false;
    }
  }

  // Procura registro do mesmo lead + canal dentro da janela.
  const idx = all.findIndex((e) => {
    if (e.channel !== input.channel) return false;
    if ((e.leadId || "") !== (input.leadId || "")) return false;
    if (!e.leadId) return false; // sem lead não há como correlacionar
    return Math.abs(new Date(e.at).getTime() - t) < DEDUPE_WINDOW_MS;
  });

  if (idx >= 0) {
    const existing = all[idx];
    if (SOURCE_PRIORITY[input.source] > SOURCE_PRIORITY[existing.source]) {
      all[idx] = {
        ...existing,
        source: input.source,
        at,
        externalKey: input.externalKey ?? existing.externalKey,
      };
      save(all);
    }
    return false;
  }

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
  byChannel: Record<ActivityChannel, number>;
  bySource: Record<ActivityChannel, Partial<Record<ActivitySource, number>>>;
}

function emptyByChannel(): Record<ActivityChannel, number> {
  return { call: 0, message: 0, email: 0, followup: 0, meeting: 0, other: 0 };
}

export function summarizeActivity(from: Date, to: Date): ActivitySummary {
  const a = from.getTime();
  const b = to.getTime();
  const byChannel = emptyByChannel();
  const bySource = {
    call: {}, message: {}, email: {}, followup: {}, meeting: {}, other: {},
  } as ActivitySummary["bySource"];
  let total = 0;

  for (const e of getActivityLedger()) {
    const t = new Date(e.at).getTime();
    if (isNaN(t) || t < a || t > b) continue;
    byChannel[e.channel] = (byChannel[e.channel] || 0) + 1;
    bySource[e.channel][e.source] = (bySource[e.channel][e.source] || 0) + 1;
    total++;
  }
  return { total, byChannel, bySource };
}
