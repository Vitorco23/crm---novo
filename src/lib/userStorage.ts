// ===== User-scoped storage with Lovable Cloud sync =====
// Local cache: heavy keys (leads, movements, sessions, meetings) live in
// IndexedDB fronted by an in-memory cache so `uload`/`usave` can stay
// synchronous for callers. Light keys stay in localStorage.
// Cloud source of truth: `public.user_storage` table.

import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet, idbDelete } from "./idbCache";

const ADMIN_EMAIL = "admin@p21.local";

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
  "p21_reminders",
  "p21_reminder_templates",
  "p21_filters_cold_call",
  "p21_filters_oportunidades",
  "p21_filters_onboarding",
  "p21_selected_script",
  "p21_call_logs",
  "p21_insights",
  "p21_rule_overrides",
  "p21_insights_last_run",
  "p21_history",
];

// Big / write-heavy keys — moved to IndexedDB to avoid the ~5MB localStorage
// quota. Everything else stays in localStorage (small, low-churn).
const HEAVY_KEYS = new Set([
  "p21_leads",
  "p21_movements",
  "p21_sessions",
  "p21_meetings",
]);

const isHeavy = (key: string) => HEAVY_KEYS.has(key);

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
  if (SCOPED_KEYS.includes(key)) scheduleCloudPush(key, data);
}

export function uremove(key: string) {
  deleteScoped(scopedKey(key), isHeavy(key));
  if (SCOPED_KEYS.includes(key)) cloudDelete(key);
}

// ===== Local hydration (IndexedDB -> memCache, + one-time LS->IDB migration) =====

export async function hydrateLocal(): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  for (const k of HEAVY_KEYS) {
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

const pendingPushes = new Map<string, { data: unknown; timer: ReturnType<typeof setTimeout> }>();
const PUSH_DEBOUNCE_MS = 800;

function scheduleCloudPush(key: string, data: unknown) {
  const existing = pendingPushes.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const entry = pendingPushes.get(key);
    pendingPushes.delete(key);
    if (entry) cloudPush(key, entry.data);
  }, PUSH_DEBOUNCE_MS);
  pendingPushes.set(key, { data, timer });
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPushes();
  });
  window.addEventListener("beforeunload", flushPendingPushes);
}

function flushPendingPushes() {
  pendingPushes.forEach((entry, key) => {
    clearTimeout(entry.timer);
    cloudPush(key, entry.data);
  });
  pendingPushes.clear();
}

async function cloudPush(key: string, data: unknown) {
  const uid = getCurrentUserId();
  if (!uid) return;
  try {
    await supabase.from("user_storage").upsert(
      { user_id: uid, key, value: data as any, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  } catch (e) {
    console.warn("[userStorage] cloud push failed", key, e);
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

/**
 * Pull all cloud rows for the current user into the local cache.
 * For keys that exist ONLY locally (legacy data on this device), push them up.
 * Returns true if any local cache changed.
 */
export async function syncFromCloud(): Promise<boolean> {
  const uid = getCurrentUserId();
  if (!uid) return false;

  let changed = false;
  try {
    const { data, error } = await supabase
      .from("user_storage")
      .select("key,value")
      .eq("user_id", uid);
    if (error) throw error;

    const cloudMap = new Map<string, unknown>();
    (data ?? []).forEach((r: any) => cloudMap.set(r.key, r.value));

    const isEmpty = (v: unknown) =>
      v == null ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

    for (const k of SCOPED_KEYS) {
      const heavy = isHeavy(k);
      const scoped = `u:${uid}:${k}`;
      // Best local candidate: scoped store (mem for heavy, LS for light).
      // Also check legacy unprefixed LS as a fallback.
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

      if (!cloudEmpty && cloudHas) {
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
          await supabase.from("user_storage").upsert(
            { user_id: uid, key: k, value: localParsed as any, updated_at: new Date().toISOString() },
            { onConflict: "user_id,key" }
          );
          console.info("[userStorage] restored", k, "from local/legacy to cloud");
        } catch (e) {
          console.warn("[userStorage] restore push failed", k, e);
        }
      }
    }
  } catch (e) {
    console.warn("[userStorage] sync failed", e);
  }
  return changed;
}
