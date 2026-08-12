// ===== Central Event Bus =====
// Ponto único de sincronização entre módulos do CRM Performance21.
// Módulos apenas emitem eventos; outros módulos reagem automaticamente.
// Nada aqui altera comportamento existente — apenas propaga.

export type P21EventType =
  | "LeadCriado"
  | "LeadAtualizado"
  | "LeadMovido"
  | "LigacaoRegistrada"
  | "MensagemRegistrada"
  | "InteracaoRegistrada"
  | "ReuniaoMarcada"
  | "ReuniaoAtualizada"
  | "ReuniaoRealizada"
  | "VendaRealizada"
  | "OnboardingIniciado"
  | "PomodoroFinalizado"
  | "FollowUpCriado"
  | "MetaAtualizada"
  | "FinanceiroAtualizado"
  | "TarefaCriada"
  | "TarefaAtualizada"
  | "TarefaConcluida";

export interface P21Event<T = any> {
  type: P21EventType;
  payload: T;
  at: string; // ISO
  /** Chave opcional de deduplicação. Se dois eventos do mesmo tipo
   *  com a mesma dedupeKey chegarem em <1s, o segundo é ignorado. */
  dedupeKey?: string;
}

type Handler = (ev: P21Event) => void;

const handlers = new Map<P21EventType, Set<Handler>>();
const wildcard = new Set<Handler>();
const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 1000;

export function on<T = any>(type: P21EventType, h: (ev: P21Event<T>) => void): () => void {
  let set = handlers.get(type);
  if (!set) { set = new Set(); handlers.set(type, set); }
  set.add(h as Handler);
  return () => set!.delete(h as Handler);
}

export function onAny(h: Handler): () => void {
  wildcard.add(h);
  return () => wildcard.delete(h);
}

export function emit<T = any>(type: P21EventType, payload: T, dedupeKey?: string) {
  if (dedupeKey) {
    const k = `${type}:${dedupeKey}`;
    const last = recent.get(k) ?? 0;
    const now = Date.now();
    if (now - last < DEDUPE_WINDOW_MS) return;
    recent.set(k, now);
    // sweep
    if (recent.size > 200) {
      for (const [key, t] of recent) if (now - t > DEDUPE_WINDOW_MS * 5) recent.delete(key);
    }
  }
  const ev: P21Event<T> = { type, payload, at: new Date().toISOString(), dedupeKey };
  const set = handlers.get(type);
  if (set) for (const h of set) { try { h(ev); } catch (e) { console.warn("[eventBus]", type, e); } }
  for (const h of wildcard) { try { h(ev); } catch (e) { console.warn("[eventBus:any]", type, e); } }
}
