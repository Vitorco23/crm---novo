// ===== User-scoped storage with Lovable Cloud sync =====
// Local cache: heavy keys (leads, movements, sessions, meetings) live in
// IndexedDB fronted by an in-memory cache so `uload`/`usave` can stay
// synchronous for callers. Light keys stay in localStorage.
// Cloud source of truth: `public.user_storage` table.

/** 
 * E-mail de administrador para compatibilidade legada.
 * Utilizado apenas na migração inicial de namespaces.
 */
const LEGACY_ADMIN_EMAIL = "vitorco23@gmail.com";


import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet, idbDelete } from "@/shared/services/idbCache";
import { ScopedWriteQueue, withRetry } from "@/shared/services/cloudWriteQueue";
import {
  SCOPED_KEYS,
  isEmptyStorageValue as isEmptyValue,
  isHeavyKey as isHeavy,
  isProtectedConfigKey,
  isScopedKey,
} from "@/shared/services/storageConfig";
import {
  formatDurationLabel,
  formatSchedulingValue,
  normalizePhoneBR,
} from "@/shared/services/inboundFormatting";

export { normalizePhoneBR } from "@/shared/services/inboundFormatting";



// In-memory cache for heavy keys so `uload` stays synchronous.
// Values are JSON strings (same shape as localStorage).
const memCache = new Map<string, string>();


let currentUserId: string | null = null;

export function setCurrentUser(userId: string | null, email?: string | null) {
  currentUserId = userId;
  if (userId) {
    localStorage.setItem("p21_current_user_id", userId);
    if (email) localStorage.setItem("p21_current_user_email", email);
    // Migrate legacy unprefixed keys to admin's namespace on first login.
    // These land in localStorage; hydrateLocal() will move heavy ones to IDB.
    if (email === LEGACY_ADMIN_EMAIL && !localStorage.getItem(`p21_migrated_${userId}`)) {
      for (const k of SCOPED_KEYS) {
        const legacy = localStorage.getItem(k);
        if (legacy !== null && localStorage.getItem(`u:${userId}:${k}`) === null) {
          localStorage.setItem(`u:${userId}:${k}`, legacy);
        }
      }
      localStorage.setItem(`p21_migrated_${userId}`, "1");
    }
  } else {
    localStorage.removeItem("p21_current_user_id");
    localStorage.removeItem("p21_current_user_email");
    memCache.clear();
  }
}

export function getCurrentUserId(): string | null {
  if (currentUserId) return currentUserId;
  currentUserId = localStorage.getItem("p21_current_user_id");
  return currentUserId;
}

function scopedKey(key: string): string {
  const uid = getCurrentUserId();
  if (!uid) return key;
  return `u:${uid}:${key}`;
}

// Low-level scoped read/write that respects the heavy/light routing.
function readScoped(scoped: string, heavy: boolean): string | null {
  if (heavy) return memCache.has(scoped) ? memCache.get(scoped)! : null;
  return localStorage.getItem(scoped);
}

function writeScoped(scoped: string, val: string, heavy: boolean) {
  if (heavy) {
    memCache.set(scoped, val);
    // fire-and-forget — durability comes from the mem cache + IDB write
    void idbSet(scoped, val);
  } else {
    localStorage.setItem(scoped, val);
  }
}

function deleteScoped(scoped: string, heavy: boolean) {
  if (heavy) {
    memCache.delete(scoped);
    void idbDelete(scoped);
  } else {
    localStorage.removeItem(scoped);
  }
}

export function uload<T>(key: string, fallback: T): T {
  try {
    const raw = readScoped(scopedKey(key), isHeavy(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usave<T>(key: string, data: T) {
  const str = JSON.stringify(data);
  writeScoped(scopedKey(key), str, isHeavy(key));
  if (isScopedKey(key)) {
    // Guard: never push an empty value for protected config keys.
    if (isProtectedConfigKey(key) && isEmptyValue(data)) return;
    scheduleCloudPush(key, data);
  }
}

export function uremove(key: string) {
  const uid = getCurrentUserId();
  deleteScoped(scopedKey(key), isHeavy(key));
  if (!uid || !isScopedKey(key)) return;

  cancelPendingPush(uid, key);
  void cloudDelete(uid, key).catch((error) => {
    reportCloudSyncError("delete", uid, key, error);
  });
}


// ===== Local hydration (IndexedDB -> memCache, + one-time LS->IDB migration) =====

export async function hydrateLocal(): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  // Derive the hydration list from the canonical scoped-key registry. This
  // avoids a second runtime dependency that can leave every lead unreadable if
  // a refactor forgets to import/export the heavy-key set.
  for (const k of SCOPED_KEYS.filter(isHeavy)) {
    const scoped = `u:${uid}:${k}`;
    let val: string | null = null;
    try {
      val = await idbGet(scoped);
    } catch {}
    // First-run migration: pull existing localStorage payload into IDB,
    // then free the localStorage slot to unblock quota.
    if (val == null) {
      const ls = localStorage.getItem(scoped);
      if (ls != null) {
        val = ls;
        try {
          await idbSet(scoped, ls);
          localStorage.removeItem(scoped);
        } catch {}
      }
    }
    if (val != null) memCache.set(scoped, val);
  }
}

// ===== Cloud sync (debounced) =====

type PendingPush = {
  userId: string;
  key: string;
  data: unknown;
  timer: ReturnType<typeof setTimeout>;
};

const pendingPushes = new Map<string, PendingPush>();
const cloudWrites = new ScopedWriteQueue();
const PUSH_DEBOUNCE_MS = 800;

function cloudScope(userId: string, key: string): string {
  return `${userId}:${key}`;
}

function cancelPendingPush(userId: string, key: string) {
  const scope = cloudScope(userId, key);
  const existing = pendingPushes.get(scope);
  if (existing) clearTimeout(existing.timer);
  pendingPushes.delete(scope);
}

function hasLocalWritePending(userId: string, key: string): boolean {
  const scope = cloudScope(userId, key);
  return pendingPushes.has(scope) || cloudWrites.hasPending(scope);
}

function reportCloudSyncError(operation: "push" | "delete", userId: string, key: string, error: unknown) {
  console.warn(`[userStorage] cloud ${operation} failed`, { key, error });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("p21:cloud-sync-error", {
      detail: { operation, userId, key },
    }));
  }
}

function scheduleCloudPush(key: string, data: unknown) {
  const userId = getCurrentUserId();
  if (!userId) return;
  const scope = cloudScope(userId, key);
  cancelPendingPush(userId, key);

  const timer = setTimeout(() => {
    const entry = pendingPushes.get(scope);
    pendingPushes.delete(scope);
    if (!entry) return;
    void cloudPush(entry.userId, entry.key, entry.data).catch((error) => {
      reportCloudSyncError("push", entry.userId, entry.key, error);
    });
  }, PUSH_DEBOUNCE_MS);

  pendingPushes.set(scope, { userId, key, data, timer });
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPushes();
  });
  window.addEventListener("beforeunload", flushPendingPushes);
}

function flushPendingPushes() {
  const entries = Array.from(pendingPushes.values());
  pendingPushes.clear();
  for (const entry of entries) {
    clearTimeout(entry.timer);
    void cloudPush(entry.userId, entry.key, entry.data).catch((error) => {
      reportCloudSyncError("push", entry.userId, entry.key, error);
    });
  }
}

/**
 * Force-pull specific keys from the cloud into local cache.
 * Only overwrites local when the cloud value is non-empty (protects config
 * from being wiped by a stale/empty backend row).
 * Returns list of keys that actually changed locally.
 */
export async function pullKeysFromCloud(keys: string[]): Promise<string[]> {
  const uid = getCurrentUserId();
  if (!uid || keys.length === 0) return [];
  const changed: string[] = [];
  try {
    const { data, error } = await supabase
      .from("user_storage")
      .select("key,value")
      .eq("user_id", uid)
      .in("key", keys);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
      // Never let an older cloud snapshot replace a local edit that is queued
      // or currently being persisted.
      if (hasLocalWritePending(uid, row.key)) continue;
      if (isEmptyValue(row.value)) continue;
      const scoped = `u:${uid}:${row.key}`;
      const heavy = isHeavy(row.key);
      const str = JSON.stringify(row.value);
      if (readScoped(scoped, heavy) !== str) {
        writeScoped(scoped, str, heavy);
        changed.push(row.key);
      }
    }
  } catch (e) {
    console.warn("[userStorage] pullKeysFromCloud failed", keys, e);
  }
  if (changed.length > 0) {
    try { window.dispatchEvent(new Event("p21:storage-synced")); } catch {}
  }
  return changed;
}

async function cloudPush(userId: string, key: string, data: unknown): Promise<void> {
  const scope = cloudScope(userId, key);
  return cloudWrites.enqueue(scope, () => withRetry(async () => {
    const { error } = await supabase.from("user_storage").upsert(
      { user_id: userId, key, value: data as any, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    if (error) throw error;
  }));
}

async function cloudDelete(userId: string, key: string): Promise<void> {
  const scope = cloudScope(userId, key);
  return cloudWrites.enqueue(scope, () => withRetry(async () => {
    const { error } = await supabase
      .from("user_storage")
      .delete()
      .eq("user_id", userId)
      .eq("key", key);
    if (error) throw error;
  }));
}

/**
 * Persists locally and waits for the matching cloud write. Queue consumers use
 * this before acknowledging/deleting inbound rows, preventing data loss.
 */
export async function saveAndConfirm<T>(key: string, data: T): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Cannot persist without an authenticated user");

  const str = JSON.stringify(data);
  writeScoped(`u:${userId}:${key}`, str, isHeavy(key));
  cancelPendingPush(userId, key);

  if (!isScopedKey(key)) return;
  if (isProtectedConfigKey(key) && isEmptyValue(data)) return;
  await cloudPush(userId, key, data);
}

/**
 * Pull all cloud rows for the current user into the local cache.
 * For keys that exist ONLY locally (legacy data on this device), push them up.
 * Returns true if any local cache changed.
 */
export async function syncFromCloud(): Promise<boolean> {
  const uid = getCurrentUserId();
  if (!uid) return false;

  // Pull the cloud snapshot before draining inbound queues. On a fresh device,
  // processing a queue against an empty cache could overwrite existing leads.


  let changed = false;
  try {
    const { data, error } = await supabase
      .from("user_storage")
      .select("key,value")
      .eq("user_id", uid);
    if (error) throw error;

    const cloudMap = new Map<string, unknown>();
    (data ?? []).forEach((r: any) => cloudMap.set(r.key, r.value));

    // Tombstones: IDs de leads deletados que não devem ser re-sincronizados.
    const tombstones = (cloudMap.get("p21_deleted_leads_tombstones") as string[]) || [];
    const tombstoneSet = new Set(tombstones);

    const isEmpty = (v: unknown) =>
      v == null ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

    for (const k of SCOPED_KEYS) {
      // The queued value is newer than this cloud snapshot. It will become the
      // source of truth when its serialized write completes.
      if (hasLocalWritePending(uid, k)) continue;
      const heavy = isHeavy(k);
      const scoped = `u:${uid}:${k}`;
      const scopedRaw = readScoped(scoped, heavy);
      const legacyRaw = localStorage.getItem(k);

      let localRaw: string | null = scopedRaw;
      try {
        const scopedParsed = scopedRaw ? JSON.parse(scopedRaw) : null;
        const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : null;
        if (isEmpty(scopedParsed) && !isEmpty(legacyParsed)) {
          localRaw = legacyRaw;
        }
      } catch {}

      const cloudHas = cloudMap.has(k);
      const cloudVal = cloudHas ? cloudMap.get(k) : undefined;
      const cloudEmpty = cloudHas && isEmpty(cloudVal);

      let localParsed: unknown = null;
      try { localParsed = localRaw ? JSON.parse(localRaw) : null; } catch {}
      const localEmpty = isEmpty(localParsed);

      // Especial para leads: aplica tombstones antes de comparar com a nuvem
      if (k === "p21_leads" && !cloudEmpty && Array.isArray(cloudVal)) {
        const filteredCloud = cloudVal.filter((l: any) => !tombstoneSet.has(l.id));
        const cloudStr = JSON.stringify(filteredCloud);
        if (scopedRaw !== cloudStr) {
          writeScoped(scoped, cloudStr, heavy);
          changed = true;
          // Se mudamos localmente por causa dos tombstones, atualizamos a nuvem também
          // para limpar o registro principal p21_leads.
          if (filteredCloud.length < cloudVal.length) {
            scheduleCloudPush(k, filteredCloud);
          }
        }
      } else if (!cloudEmpty && cloudHas) {
        const cloudStr = JSON.stringify(cloudVal);
        if (scopedRaw !== cloudStr) {
          writeScoped(scoped, cloudStr, heavy);
          changed = true;
        }
      } else if (!localEmpty) {
        // Restore: push the non-empty local (possibly recovered from legacy) to cloud
        writeScoped(scoped, localRaw!, heavy);
        changed = true;
        try {
          await cloudPush(uid, k, localParsed);
          console.info("[userStorage] restored", k, "from local/legacy to cloud");
        } catch (e) {
          reportCloudSyncError("push", uid, k, e);
        }
      }
    }

  } catch (e) {
    console.warn("[userStorage] sync failed", e);
  }

  // With the complete lead snapshot available locally, drain both queues.
  // Each queue item is acknowledged only after its cloud write succeeds.
  try {
    const inboundLeads = await syncInboundLeads();
    if (inboundLeads > 0) changed = true;
  } catch (e) {
    console.warn("[userStorage] inbound leads sync failed", e);
  }

  try {
    const inboundInteractions = await syncInboundInteractions();
    if (inboundInteractions > 0) changed = true;
  } catch (e) {
    console.warn("[userStorage] inbound interactions sync failed", e);
  }

  return changed;
}

// ===== Landing Page inbound queue =====
// Drena `public.leads_inbound`: converte cada registro em um lead do CRM,
// insere na primeira etapa de Oportunidades (p21_leads) e apaga da fila.

const FIRST_OPP_STAGE = "Reunião Marcada";

type InboundRow = { id: string; dados: any; created_at: string };
type Lead = Record<string, any>;

function inboundToLead(row: InboundRow): { lead: Lead; meeting: any | null } {
  const d = row.dados ?? {};
  const nowISO = new Date().toISOString();
  const contact = String(d.contact ?? d.nome ?? d.name ?? "").trim();
  const company = String(d.company ?? d.empresa ?? "").trim();
  const phone = String(d.phone ?? d.whatsapp ?? d.telefone ?? "").trim();
  const email = String(d.email ?? "").trim();
  const notesBase = String(d.notes ?? d.observacoes ?? "").trim();
  const source = String(d.source ?? "landing_page");
  const leadId = (globalThis.crypto?.randomUUID?.() as string | undefined) ??
      `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const mtg = d.meeting ?? null;
  let meeting: any | null = null;
  if (mtg?.startISO) {
    const start = new Date(mtg.startISO);
    const tz = mtg.timeZone || "America/Sao_Paulo";
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(start); // yyyy-mm-dd
    const timeStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(start); // HH:mm
    meeting = {
      id: (globalThis.crypto?.randomUUID?.() as string | undefined) ??
        `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      leadId,
      company: company || contact || "Sem nome",
      date: dateStr,
      time: timeStr,
      title: `Reunião — ${company || contact || "Landing Page"}`,
      contactName: contact,
      channel: mtg.channel || "Google Meet",
      source: "Disparo",
      link: mtg.meetLink || mtg.htmlLink || "",
      meetLink: mtg.meetLink || null,
      googleEventId: mtg.eventId || undefined,
      googleEventUrl: mtg.htmlLink || undefined,
      attendeeEmail: email || undefined,
      notes: "Agendada via Landing Page",
      createdAt: row.created_at || nowISO,
    };
  }

  const lead: Lead = {
    id: leadId,
    company: company || contact || "Sem nome",
    contact,
    phone,
    phoneNormalized: normalizePhoneBR(phone),
    email,
    niche: String(d.niche ?? d.nicho ?? ""),
    city: String(d.city ?? d.cidade ?? ""),
    gmnLink: "",
    instagramLink: String(d.instagram ?? ""),
    icpStars: 2,
    runsAds: false,
    stage: FIRST_OPP_STAGE,
    createdAt: row.created_at || nowISO,
    stageChangedAt: row.created_at || nowISO,
    notes: [
      notesBase,
      `Origem: Landing Page${source && source !== "landing_page" ? ` (${source})` : ""}`,
      meeting ? `Reunião marcada: ${meeting.date} às ${meeting.time}${meeting.meetLink ? ` — ${meeting.meetLink}` : ""}` : "",
    ].filter(Boolean).join("\n"),
    attachments: [],
    callNotes: [],
    source: "landing_page",
  };
  return { lead, meeting };
}

let inboundSyncRunning = false;
let inboundSyncPending = false;

export function isSyncingInbound() {
  return inboundSyncRunning;
}

export async function syncInboundLeads(): Promise<number> {
  const uid = getCurrentUserId();
  if (!uid) return 0;

  // Implementação de lock para evitar concorrência
  if (inboundSyncRunning) {
    inboundSyncPending = true;
    return 0;
  }
  

  inboundSyncRunning = true;
  inboundSyncPending = false;
  

  try {
    const { data, error } = await supabase
      .from("leads_inbound")
      .select("id,dados,created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as InboundRow[];
    if (rows.length === 0) return 0;

    const existing = uload<Lead[]>("p21_leads", []);
    const tombstones = uload<string[]>("p21_deleted_leads_tombstones", []);
    const tombstoneSet = new Set(tombstones);

    
    
    // Proteção contra duplicação: verifica se o inbound id já foi processado 
    // ou se o lead já existe no storage local por algum motivo.
    const converted = rows.filter(row => !tombstoneSet.has(row.id) && !tombstoneSet.has((inboundToLead(row).lead as any).id)).map(row => {
      const localExisting = existing.find(l => (l as any).inboundId === row.id);

      const { lead: incomingLead, meeting } = inboundToLead(row);
      (incomingLead as any).inboundId = row.id;

      if (localExisting) {
        localExisting.niche = incomingLead.niche || localExisting.niche;
        localExisting.notes = incomingLead.notes;
        return { lead: localExisting, meeting, isUpdate: true };
      }
      return { lead: incomingLead, meeting, isUpdate: false };
    });

    const newEntries = converted.filter(c => !c.isUpdate);
    const updatedEntries = converted.filter(c => c.isUpdate);

    if (newEntries.length === 0 && updatedEntries.length === 0) {
      const ids = rows.map((r) => r.id);
      await supabase.from("leads_inbound").delete().in("id", ids);
      return 0;
    }

    if (newEntries.length > 0) {
      const newLeads = newEntries.map(c => c.lead);
      await saveAndConfirm<Lead[]>("p21_leads", [...newLeads, ...existing]);
    } else if (updatedEntries.length > 0) {
      await saveAndConfirm<Lead[]>("p21_leads", [...existing]);
    }

    const newMeetings = converted.map(c => c.meeting).filter(Boolean);
    if (newMeetings.length > 0) {
      const existingMeetings = uload<any[]>("p21_meetings", []);
      const meetingsToSave = [...existingMeetings];
      for (const m of newMeetings) {
        const idx = meetingsToSave.findIndex(em => em.googleEventId === m.googleEventId || (em.leadId === m.leadId && em.date === m.date && em.time === m.time));
        if (idx >= 0) meetingsToSave[idx] = m;
        else meetingsToSave.unshift(m);
      }
      await saveAndConfirm<any[]>("p21_meetings", meetingsToSave);
    }

    const ids = rows.map((r) => r.id);
    const { error: delErr } = await supabase.from("leads_inbound").delete().in("id", ids);
    if (delErr) {
      console.warn("[userStorage] failed to delete drained inbound rows", delErr);
      // O lock de duplicados (inboundId no storage local) já protege contra re-processamento
      // se o delete falhar e a linha for lida novamente.
    }

    window.dispatchEvent(new Event("p21:storage-synced"));
    window.dispatchEvent(new CustomEvent("p21:leads-changed", { detail: { source: "inbound", count: converted.length } }));
    window.dispatchEvent(new CustomEvent("p21:meetings-changed", { detail: { source: "inbound", count: newMeetings.length } }));
    return converted.length;
  } finally {
    inboundSyncRunning = false;
    if (inboundSyncPending) {
      setTimeout(() => syncInboundLeads(), 100);
    }
  }
}

// Alias público — mesma rotina, nome dedicado para chamadas manuais (botão UI).
export const pullInboundLeads = syncInboundLeads;



// ===== Matteline / n8n inbound interactions queue =====
// Drena `public.interactions_inbound`: localiza o Lead pelo telefone
// normalizado, cria uma Interaction no MESMO formato do CRM
// (src/lib/store.ts → addInteraction) e marca a linha como `processed`.
// Em caso de erro, grava a mensagem em `dados.error` e mantém `processed=false`
// para permitir nova tentativa.

type InboundInteractionRow = {
  id: string;
  dados: any;
  phone_normalized: string | null;
  processed: boolean;
  created_at: string;
};

// Mesma normalização usada pela edge function receive-matteline-call.
/**
 * Formato oficial de telefone para integrações do CRM.
 * Regras (resilientes a qualquer formato recebido por integrações):
 *  1. Remove qualquer caractere não numérico.
 *  2. Se já começar com "55" e tiver ao menos 12 dígitos, preserva.
 *  3. Se começar com "0" (trunk local), preserva o 0 e prefixa "55".
 *     Ex.: "079998992121" → "55079998992121".
 *  4. Se tiver apenas DDD + número (10 ou 11 dígitos), prefixa "550"
 *     para produzir o mesmo canônico dos casos acima.
 *     Ex.: "79998992121" → "55079998992121".
 *  5. Qualquer outro caso: retorna os dígitos como estão.
 *
 * Todos os exemplos abaixo produzem o MESMO phoneNormalized:
 *   "55079998992121", "079998992121", "79998992121", "(79) 99989-9212"
 *   → "55079998992121"
 *
 * Comparações de telefone no CRM devem SEMPRE passar por esta função antes.
 */
// Alias interno legado (mantido para não quebrar chamadas locais existentes).
const normalizePhoneForMatch = normalizePhoneBR;

function buildInteractionFromInbound(row: InboundInteractionRow, lead: Lead): {
  type: string; date: string; title: string; summary: string; sellerNotes?: string; createdAt: string;
} {
  const d = row.dados ?? {};
  const seller = d.seller ?? {};
  const sellerName = String(seller.name || seller.email || "").trim();
  const durationSec = typeof d.durationSec === "number" ? d.durationSec : null;
  const durationLabel = formatDurationLabel(durationSec);
  const score = typeof d.score === "number" ? d.score : null;
  const scheduling = formatSchedulingValue(d.scheduling);

  // Summary = resumo enviado pela Matteline (fonte principal para IA/timeline).
  const summary = String(d.summary || d.transcription || "").trim() || "Ligação registrada via Matteline.";

  // sellerNotes concentra os metadados (áudio, link, vendedor, duração, score,
  // agendamento) sem poluir o campo `summary`.
  const metaLines: string[] = [];
  if (sellerName) metaLines.push(`Vendedor: ${sellerName}`);
  if (durationLabel) metaLines.push(`Duração: ${durationLabel}`);
  if (score !== null) metaLines.push(`Score Comercial: ${Math.round(score)}%`);
  if (d.callStatus) metaLines.push(`Status: ${d.callStatus}`);
  if (d.callLink) metaLines.push(`Ligação: ${d.callLink}`);
  if (d.audioUrl) metaLines.push(`Áudio: ${d.audioUrl}`);
  if (scheduling) metaLines.push(`Agendamento: ${scheduling}`);
  metaLines.push(`Origem: Matteline (n8n)`);

  // `date` = quando a ligação aconteceu. Preferimos `receivedAt`, senão created_at.
  const rawDate = String(d.receivedAt || row.created_at || new Date().toISOString());
  const parsed = new Date(rawDate);
  const date = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();

  // Título curto e informativo — inclui empresa e vendedor quando existir.
  const title = `Ligação — ${lead.company || lead.contact || "Lead"}${sellerName ? ` (${sellerName})` : ""}`;

  return {
    type: "Ligação",
    date,
    title,
    summary,
    sellerNotes: metaLines.join("\n") || undefined,
    createdAt: date,
  };
}

export async function syncInboundInteractions(): Promise<number> {
  const uid = getCurrentUserId();
  if (!uid) return 0;

  const { data, error } = await supabase
    .from("interactions_inbound")
    .select("id,dados,phone_normalized,processed,created_at")
    .eq("processed", false)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as InboundInteractionRow[];
  if (rows.length === 0) return 0;

  const leads = uload<Lead[]>("p21_leads", []);

  // Índice phoneNormalized → lead (primeira ocorrência ganha).
  // Sempre confia no campo `phoneNormalized` do Lead (fonte oficial). Se ele
  // não existir (Lead legado ainda não migrado nesta sessão), calcula on-the-fly.
  const phoneIndex = new Map<string, Lead[]>();
  for (const l of leads) {
    const p = l.phoneNormalized || normalizePhoneBR(l.phone || l.whatsapp);
    if (!p) continue;
    const arr = phoneIndex.get(p) ?? [];
    arr.push(l);
    phoneIndex.set(p, arr);
  }

  let appended = 0;
  let needsLeadPersistence = false;
  const okIds: string[] = [];
  const affectedLeadIds = new Set<string>();
  const failed: Array<{ id: string; error: string; dados: any }> = [];
  const ledgerEntries: Array<{ leadId: string; at: string; externalKey: string }> = [];

  for (const row of rows) {
    try {
      // SEMPRE renormaliza antes de consultar o índice — nunca confia no valor
      // bruto vindo da fila (linhas antigas podem ter phone_normalized parcial).
      const phoneRaw = row.phone_normalized || row.dados?.destinationRaw;
      const phone = normalizePhoneBR(phoneRaw);
      if (!phone) {
        failed.push({ id: row.id, error: "missing_phone", dados: row.dados });
        continue;
      }
      const matches = phoneIndex.get(phone) ?? [];
      const lead = matches[0];
      if (!lead) {
        failed.push({ id: row.id, error: `lead_not_found:${phone}`, dados: row.dados });
        continue;
      }

      const interactionId = `inbound:${row.id}`;
      const existingInteractions = (lead.interactions as any[]) || [];
      if (existingInteractions.some((item) => item.id === interactionId || item.inboundId === row.id)) {
        // A previous attempt may have updated the local cache but failed before
        // acknowledging the queue row. Re-persist the same lead before acking.
        needsLeadPersistence = true;
        okIds.push(row.id);
        continue;
      }

      const interaction = buildInteractionFromInbound(row, lead);
      const withId = {
        id: interactionId,
        inboundId: row.id,
        ...interaction,
      };
      lead.interactions = [...existingInteractions, withId];
      appended++;
      needsLeadPersistence = true;
      okIds.push(row.id);
      affectedLeadIds.add(lead.id);
      ledgerEntries.push({ leadId: lead.id, at: interaction.date, externalKey: interactionId });
    } catch (e: any) {
      console.error("[inbound-int] row failed", { id: row.id, error: e?.message || String(e) });
      failed.push({ id: row.id, error: e?.message || String(e), dados: row.dados });
    }
  }


  if (needsLeadPersistence) {
    await saveAndConfirm<Lead[]>("p21_leads", leads);
  }

  // Ledger de atividade estimada — import dinâmico evita ciclo de módulos.
  if (ledgerEntries.length > 0) {
    try {
      const { recordActivity } = await import("@/shared/services/activityLedger");
      for (const e of ledgerEntries) {
        recordActivity({ leadId: e.leadId, channel: "call", source: "callface", at: e.at, externalKey: e.externalKey });
      }
    } catch (e) {
      console.warn("[activityLedger] inbound record failed", e);
    }
  }

  if (okIds.length > 0) {
    const { error: upErr } = await supabase
      .from("interactions_inbound")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .in("id", okIds);
    if (upErr) {
      console.warn("[userStorage] failed to mark interactions_inbound processed", upErr);
    }
  }

  for (const f of failed) {
    const dadosWithError = { ...(f.dados ?? {}), error: f.error, errorAt: new Date().toISOString() };
    const { error: errUp } = await supabase
      .from("interactions_inbound")
      .update({ dados: dadosWithError })
      .eq("id", f.id);
    if (errUp) {
      console.warn("[userStorage] failed to record inbound interaction error", errUp);
    }
  }

  if (appended > 0) {
    window.dispatchEvent(new Event("p21:storage-synced"));
    window.dispatchEvent(
      new CustomEvent("p21:leads-changed", { detail: { source: "inbound-interactions", count: appended } })
    );

    // Diagnóstico Automático V1.1 — dispara para cada Lead afetado.
    // Fire-and-forget: nunca bloqueia a sincronização. Import dinâmico evita
    // ciclo (autoDiagnosis.ts → store.ts → userStorage.ts).
    if (affectedLeadIds.size > 0) {
      import("@/modules/intelligence/services/autoDiagnosis")
        .then(({ runAutoDiagnosisForLeads }) => runAutoDiagnosisForLeads(Array.from(affectedLeadIds)))
        .catch((e) => console.warn("[autoDiagnosis] trigger failed", e));
    }
  }
  return appended;
}

// Alias público — para uso manual (ex.: botão de UI).
export async function pullInboundInteractions(): Promise<number> {
  return syncInboundInteractions();
}


