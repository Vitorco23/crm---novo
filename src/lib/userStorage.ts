// ===== User-scoped storage with Lovable Cloud sync =====
// Local cache: localStorage prefixed with `u:<userId>:`.
// Cloud source of truth: `public.user_storage` table (one row per key per user).
//
// On login we pull all keys from cloud into the local cache (and push any
// local-only legacy keys up). On every save we write locally AND upsert to the
// cloud asynchronously so other devices can pick it up on their next login.

import { supabase } from "@/integrations/supabase/client";

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
];

let currentUserId: string | null = null;

export function setCurrentUser(userId: string | null, email?: string | null) {
  currentUserId = userId;
  if (userId) {
    localStorage.setItem("p21_current_user_id", userId);
    if (email) localStorage.setItem("p21_current_user_email", email);
    // Migrate legacy unprefixed keys to admin's namespace on first login
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

export function uload<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usave<T>(key: string, data: T) {
  localStorage.setItem(scopedKey(key), JSON.stringify(data));
  // Push to cloud (fire-and-forget). Only sync known keys to avoid noise.
  if (SCOPED_KEYS.includes(key)) cloudPush(key, data);
}

export function uremove(key: string) {
  localStorage.removeItem(scopedKey(key));
  if (SCOPED_KEYS.includes(key)) cloudDelete(key);
}

// ===== Cloud sync =====

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

    for (const k of SCOPED_KEYS) {
      const localRaw = localStorage.getItem(`u:${uid}:${k}`);
      if (cloudMap.has(k)) {
        const cloudVal = JSON.stringify(cloudMap.get(k));
        if (localRaw !== cloudVal) {
          localStorage.setItem(`u:${uid}:${k}`, cloudVal);
          changed = true;
        }
      } else if (localRaw !== null) {
        // Local-only -> push to cloud (initial migration from this device)
        try {
          await supabase.from("user_storage").upsert(
            { user_id: uid, key: k, value: JSON.parse(localRaw), updated_at: new Date().toISOString() },
            { onConflict: "user_id,key" }
          );
        } catch (e) {
          console.warn("[userStorage] initial push failed", k, e);
        }
      }
    }
  } catch (e) {
    console.warn("[userStorage] sync failed", e);
  }
  return changed;
}
