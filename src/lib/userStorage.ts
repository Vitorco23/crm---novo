// ===== User-scoped storage with Lovable Cloud sync =====
// Local cache: localStorage prefixed with `u:<userId>:`.
// Cloud source of truth: `public.user_storage` table (one row per key per user).
//
// Improvements:
// - Debounced cloud writes (batched, non-blocking UI)
// - Incremental sync (only fetch keys that changed since last sync)
// - Lazy sync (priority keys first, rest in background)
// - Auto local backups before destructive sync
// - Realtime subscription (other devices push updates)

import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = "admin@p21.local";

// Keys that are synced to the cloud
const SCOPED_KEYS = [
  "p21_leads",
  "p21_movements",
  "p21_sessions",
  "p21_meetings",
  "p21_goals_settings",
  "p21_stages_cold_call",
  "p21_stages_oportunidades",
  "p21_stages_onboarding",
  "p21_finance_tx",
  "p21_scrum_tasks",
  "p21_scrum_sprints",
  "p21_daily_tasks",
  "p21_daily_checks",
];

// Loaded first on login (visible immediately on the main screen)
const PRIORITY_KEYS = ["p21_leads", "p21_daily_tasks", "p21_daily_checks", "p21_goals_settings"];

let currentUserId: string | null = null;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingLocalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1200;
const LOCAL_DEBOUNCE_MS = 250;

// In-memory cache: avoids re-parsing huge JSONs on every read.
// Source of truth during a session; localStorage + cloud are persistence layers.
const memCache = new Map<string, unknown>();
// Track our own recent pushes to ignore realtime echo from this device.
const recentPushes = new Map<string, number>();
const ECHO_WINDOW_MS = 4000;

// Sync status pub-sub
type SyncState = "idle" | "syncing" | "saving" | "error" | "offline";
let syncState: SyncState = "idle";
const syncListeners = new Set<(s: SyncState) => void>();
function setSyncState(s: SyncState) {
  syncState = s;
  syncListeners.forEach((l) => l(s));
}
export function getSyncState(): SyncState { return syncState; }
export function onSyncStateChange(fn: (s: SyncState) => void) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

export function setCurrentUser(userId: string | null, email?: string | null) {
  currentUserId = userId;
  if (userId) {
    localStorage.setItem("p21_current_user_id", userId);
    if (email) localStorage.setItem("p21_current_user_email", email);
    if (email === ADMIN_EMAIL && !localStorage.getItem(`p21_migrated_${userId}`)) {
      for (const k of SCOPED_KEYS) {
        const legacy = localStorage.getItem(k);
        if (legacy !== null && localStorage.getItem(`u:${userId}:${k}`) === null) {
          localStorage.setItem(`u:${userId}:${k}`, legacy);
        }
      }
      localStorage.setItem(`p21_migrated_${userId}`, "1");
    }
  } else {
    memCache.clear();
    pendingTimers.forEach((t) => clearTimeout(t));
    pendingTimers.clear();
    pendingLocalTimers.forEach((t) => clearTimeout(t));
    pendingLocalTimers.clear();
    if (realtimeChannel) {
      try { supabase.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
    localStorage.removeItem("p21_current_user_id");
    localStorage.removeItem("p21_current_user_email");
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

function lastSyncKey(): string {
  const uid = getCurrentUserId();
  return `u:${uid}:__last_sync_at`;
}

function isEmpty(v: unknown): boolean {
  return (
    v == null ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)
  );
}

export function uload<T>(key: string, fallback: T): T {
  const sk = scopedKey(key);
  if (memCache.has(sk)) return memCache.get(sk) as T;
  try {
    const raw = localStorage.getItem(sk);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      memCache.set(sk, parsed);
      return parsed;
    }
  } catch {}
  return fallback;
}

export function usave<T>(key: string, data: T) {
  const sk = scopedKey(key);
  // Update memory immediately (sync, O(1)) — UI sees fresh data instantly
  memCache.set(sk, data);
  // Debounced localStorage write (avoids JSON.stringify of 2k leads on every keystroke/click)
  scheduleLocalPersist(sk, data);
  if (SCOPED_KEYS.includes(key)) scheduleCloudPush(key, data);
}

export function uremove(key: string) {
  const sk = scopedKey(key);
  memCache.delete(sk);
  localStorage.removeItem(sk);
  if (SCOPED_KEYS.includes(key)) cloudDelete(key);
}

// ===== Debounced local persist (offload JSON.stringify of large blobs) =====

function scheduleLocalPersist(sk: string, data: unknown) {
  const existing = pendingLocalTimers.get(sk);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pendingLocalTimers.delete(sk);
    try {
      localStorage.setItem(sk, JSON.stringify(data));
    } catch (e) {
      console.warn("[userStorage] local persist failed", sk, e);
    }
  }, LOCAL_DEBOUNCE_MS);
  pendingLocalTimers.set(sk, t);
}

// Flush pending local writes before unload to avoid data loss
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    pendingLocalTimers.forEach((t, sk) => {
      clearTimeout(t);
      const v = memCache.get(sk);
      if (v !== undefined) {
        try { localStorage.setItem(sk, JSON.stringify(v)); } catch {}
      }
    });
    pendingLocalTimers.clear();
  });
}

// ===== Debounced cloud push =====

function scheduleCloudPush(key: string, data: unknown) {
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  setSyncState("saving");
  const t = setTimeout(() => {
    pendingTimers.delete(key);
    cloudPush(key, data);
  }, DEBOUNCE_MS);
  pendingTimers.set(key, t);
}

async function cloudPush(key: string, data: unknown) {
  const uid = getCurrentUserId();
  if (!uid) return;
  try {
    recentPushes.set(key, Date.now());
    const { error } = await supabase.from("user_storage").upsert(
      { user_id: uid, key, value: data as any, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    if (error) throw error;
    if (pendingTimers.size === 0) setSyncState("idle");
  } catch (e) {
    console.warn("[userStorage] cloud push failed", key, e);
    setSyncState("error");
  }
}

async function cloudDelete(key: string) {
  const uid = getCurrentUserId();
  if (!uid) return;
  try {
    await supabase.from("user_storage").delete().eq("user_id", uid).eq("key", key);
  } catch (e) {
    console.warn("[userStorage] cloud delete failed", key, e);
  }
}

// ===== Local backup safety net =====

const MAX_BACKUPS = 3;

function backupKey(uid: string, key: string, ts: number): string {
  return `u:${uid}:__bak:${key}:${ts}`;
}

function snapshotBeforeOverwrite(uid: string, key: string, currentRaw: string) {
  try {
    const ts = Date.now();
    localStorage.setItem(backupKey(uid, key, ts), currentRaw);
    // prune old backups for this key
    const prefix = `u:${uid}:__bak:${key}:`;
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix)).sort();
    while (keys.length > MAX_BACKUPS) {
      const oldest = keys.shift();
      if (oldest) localStorage.removeItem(oldest);
    }
  } catch {
    // ignore quota errors
  }
}

// ===== Incremental sync from cloud =====

async function syncKeys(keys: string[], uid: string): Promise<boolean> {
  if (keys.length === 0) return false;
  let changed = false;
  try {
    const { data, error } = await supabase
      .from("user_storage")
      .select("key,value,updated_at")
      .eq("user_id", uid)
      .in("key", keys);
    if (error) throw error;

    const cloudMap = new Map<string, { value: unknown; updated_at: string }>();
    (data ?? []).forEach((r: any) => cloudMap.set(r.key, { value: r.value, updated_at: r.updated_at }));

    for (const k of keys) {
      const scopedRaw = localStorage.getItem(`u:${uid}:${k}`);
      const legacyRaw = localStorage.getItem(k);
      let localRaw: string | null = scopedRaw;
      try {
        const sp = scopedRaw ? JSON.parse(scopedRaw) : null;
        const lp = legacyRaw ? JSON.parse(legacyRaw) : null;
        if (isEmpty(sp) && !isEmpty(lp)) localRaw = legacyRaw;
      } catch {}

      const cloudEntry = cloudMap.get(k);
      const cloudHas = !!cloudEntry;
      const cloudVal = cloudEntry?.value;
      const cloudEmpty = cloudHas && isEmpty(cloudVal);

      let localParsed: unknown = null;
      try { localParsed = localRaw ? JSON.parse(localRaw) : null; } catch {}
      const localEmpty = isEmpty(localParsed);

      if (!cloudEmpty && cloudHas) {
        const cloudStr = JSON.stringify(cloudVal);
        if (scopedRaw !== cloudStr) {
          // Backup current local before overwriting
          if (scopedRaw && !isEmpty(localParsed)) {
            snapshotBeforeOverwrite(uid, k, scopedRaw);
          }
          localStorage.setItem(`u:${uid}:${k}`, cloudStr);
          memCache.set(`u:${uid}:${k}`, cloudVal);
          changed = true;
        } else {
          memCache.set(`u:${uid}:${k}`, cloudVal);
        }
      } else if (!localEmpty) {
        // Cloud empty/missing but local has data → restore to cloud
        localStorage.setItem(`u:${uid}:${k}`, localRaw!);
        memCache.set(`u:${uid}:${k}`, localParsed);
        changed = true;
        try {
          recentPushes.set(k, Date.now());
          await supabase.from("user_storage").upsert(
            { user_id: uid, key: k, value: localParsed as any, updated_at: new Date().toISOString() },
            { onConflict: "user_id,key" }
          );
          console.info("[userStorage] restored", k, "from local to cloud");
        } catch (e) {
          console.warn("[userStorage] restore push failed", k, e);
        }
      }
    }
  } catch (e) {
    console.warn("[userStorage] syncKeys failed", e);
    setSyncState("error");
  }
  return changed;
}

/**
 * Lazy sync: returns after PRIORITY_KEYS are loaded, schedules the rest.
 */
export async function syncFromCloud(): Promise<boolean> {
  const uid = getCurrentUserId();
  if (!uid) return false;
  setSyncState("syncing");

  const priority = PRIORITY_KEYS.filter((k) => SCOPED_KEYS.includes(k));
  const rest = SCOPED_KEYS.filter((k) => !priority.includes(k));

  const changedFirst = await syncKeys(priority, uid);

  // Background sync of remaining keys
  setTimeout(async () => {
    const changedRest = await syncKeys(rest, uid);
    localStorage.setItem(lastSyncKey(), new Date().toISOString());
    setSyncState("idle");
    if (changedRest) window.dispatchEvent(new Event("p21:storage-synced"));
    subscribeRealtime(uid);
  }, 50);

  return changedFirst;
}

// ===== Realtime: react to writes from other devices =====

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function subscribeRealtime(uid: string) {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel(`user_storage:${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_storage", filter: `user_id=eq.${uid}` },
      (payload: any) => {
        const row = (payload.new ?? payload.old) as { key: string; value: unknown } | undefined;
        if (!row) return;

        // Anti-echo: ignore events caused by this device's own recent pushes
        const lastPush = recentPushes.get(row.key);
        if (lastPush && Date.now() - lastPush < ECHO_WINDOW_MS) return;

        // Skip while we have pending local saves for this key (we're the writer)
        if (pendingTimers.has(row.key) || pendingLocalTimers.has(`u:${uid}:${row.key}`)) return;

        const sk = `u:${uid}:${row.key}`;
        if (payload.eventType === "DELETE") {
          memCache.delete(sk);
          if (localStorage.getItem(sk)) localStorage.removeItem(sk);
          return;
        }
        const newVal = (payload.new as any).value;
        const cur = localStorage.getItem(sk);
        const next = JSON.stringify(newVal);
        if (cur !== next) {
          if (cur) snapshotBeforeOverwrite(uid, row.key, cur);
          localStorage.setItem(sk, next);
          memCache.set(sk, newVal);
          window.dispatchEvent(new Event("p21:storage-synced"));
        }
      }
    )
    .subscribe();
}

// ===== Backup export / import =====

export function exportAllData(): string {
  const uid = getCurrentUserId();
  const out: Record<string, unknown> = {};
  if (!uid) return JSON.stringify({ exportedAt: new Date().toISOString(), user: null, data: {} });
  for (const k of SCOPED_KEYS) {
    const raw = localStorage.getItem(`u:${uid}:${k}`);
    if (raw) {
      try { out[k] = JSON.parse(raw); } catch {}
    }
  }
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    user: localStorage.getItem("p21_current_user_email"),
    data: out,
  }, null, 2);
}

export async function importBackup(json: string, mode: "merge" | "replace" = "replace"): Promise<number> {
  const uid = getCurrentUserId();
  if (!uid) throw new Error("Faça login antes de importar.");
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { throw new Error("Arquivo inválido (não é JSON)."); }
  const data = parsed.data ?? parsed;
  let count = 0;
  for (const k of SCOPED_KEYS) {
    if (!(k in data)) continue;
    const value = data[k];
    if (mode === "merge" && Array.isArray(value)) {
      // Merge by id when possible
      const cur = uload<any[]>(k, []);
      const seen = new Set(cur.map((x: any) => x?.id).filter(Boolean));
      const merged = [...cur, ...value.filter((x: any) => !x?.id || !seen.has(x.id))];
      usave(k, merged);
    } else {
      usave(k, value);
    }
    count++;
  }
  return count;
}

export function getStorageStats() {
  const uid = getCurrentUserId();
  if (!uid) return { keys: 0, sizeBytes: 0, lastSync: null as string | null, leadsCount: 0 };
  let bytes = 0;
  let keys = 0;
  for (const k of SCOPED_KEYS) {
    const raw = localStorage.getItem(`u:${uid}:${k}`);
    if (raw) { bytes += raw.length; keys++; }
  }
  let leadsCount = 0;
  try {
    const raw = localStorage.getItem(`u:${uid}:p21_leads`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) leadsCount = arr.length;
    }
  } catch {}
  return {
    keys,
    sizeBytes: bytes,
    lastSync: localStorage.getItem(lastSyncKey()),
    leadsCount,
  };
}
