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
  "p21_bottleneck_history",
  "p21_central_filters",
  "p21_lab_filters",
  "p21_lab_experiments",
  "p21_cadence_overrides",
  "p21_lead_tasks",
  "p21_diretor_ia_last_run",
  "p21_diretor_ia_history",
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

// Config keys whose "empty" value must NEVER overwrite a non-empty cloud value.
// Prevents a fresh device (with defaults / no data) from wiping cloud config.
const PROTECTED_CONFIG_KEYS = new Set([
  "p21_cadence_overrides",
  "p21_reminder_templates",
  "p21_diretor_ia_history",
  "p21_diretor_ia_last_run",
]);

function isEmptyValue(v: unknown): boolean {
  return (
    v == null ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)
  );
}

export function usave<T>(key: string, data: T) {
  const str = JSON.stringify(data);
  writeScoped(scopedKey(key), str, isHeavy(key));
  if (SCOPED_KEYS.includes(key)) {
    // Guard: never push an empty value for protected config keys.
    if (PROTECTED_CONFIG_KEYS.has(key) && isEmptyValue(data)) return;
    scheduleCloudPush(key, data);
  }
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

  // Drena a caixa de entrada de leads vindos da Landing Page antes de puxar o resto.
  try {
    await syncInboundLeads();
  } catch (e) {
    console.warn("[userStorage] inbound sync failed", e);
  }

  // Drena a caixa de entrada de interações comerciais (n8n/Matteline).
  try {
    await syncInboundInteractions();
  } catch (e) {
    console.warn("[userStorage] inbound interactions sync failed", e);
  }


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

export async function syncInboundLeads(): Promise<number> {
  const uid = getCurrentUserId();
  if (!uid) return 0;

  const { data, error } = await supabase
    .from("leads_inbound")
    .select("id,dados,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as InboundRow[];
  if (rows.length === 0) return 0;

  const existing = uload<Lead[]>("p21_leads", []);
  const converted = rows.map(inboundToLead);
  const newLeads = converted.map(c => c.lead);
  usave<Lead[]>("p21_leads", [...newLeads, ...existing]);

  const newMeetings = converted.map(c => c.meeting).filter(Boolean);
  if (newMeetings.length > 0) {
    const existingMeetings = uload<any[]>("p21_meetings", []);
    usave<any[]>("p21_meetings", [...newMeetings, ...existingMeetings]);
  }

  const ids = rows.map((r) => r.id);
  const { error: delErr } = await supabase.from("leads_inbound").delete().in("id", ids);
  if (delErr) {
    console.warn("[userStorage] failed to delete drained inbound rows", delErr);
  }

  window.dispatchEvent(new Event("p21:storage-synced"));
  window.dispatchEvent(new CustomEvent("p21:leads-changed", { detail: { source: "inbound", count: newLeads.length } }));
  window.dispatchEvent(new CustomEvent("p21:meetings-changed", { detail: { source: "inbound", count: newMeetings.length } }));
  return newLeads.length;
}


// Alias público — mesma rotina, nome dedicado para chamadas manuais (botão UI).
export async function pullInboundLeads(): Promise<number> {
  return syncInboundLeads();
}


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
 * Sempre retorna `55` + DDD + número (E.164 sem "+"), ou "" quando inválido.
 * - Remove tudo que não for dígito (espaços, parênteses, hífens, "+").
 * - Se já vier com 55 no início (12–13 dígitos), preserva.
 * - Se vier só com DDD + número (10 ou 11 dígitos), adiciona "55".
 * - Não adiciona 55 duas vezes.
 */
export function normalizePhoneBR(raw: string | undefined | null): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "";
  // Remove um 0 inicial de trunk local antes do DDD (ex.: 07932143013 → 7932143013).
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("0")) digits = digits.slice(1);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// Alias interno legado (mantido para não quebrar chamadas locais existentes).
const normalizePhoneForMatch = normalizePhoneBR;

function formatDurationLabel(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m${r.toString().padStart(2, "0")}s` : `${r}s`;
}

/** Converte o objeto/valor de agendamento vindo da Matteline em texto legível.
 *  Nunca retorna "[object Object]"; retorna "" quando não há dado válido. */
function formatSchedulingValue(sch: any): string {
  if (sch == null) return "";
  if (typeof sch === "string") return sch.trim();
  if (typeof sch === "number") return String(sch);
  if (typeof sch !== "object") return "";
  const rawDate = sch.data ?? sch.date ?? sch.dia ?? sch.day ?? "";
  const rawTime = sch.hora ?? sch.time ?? sch.horario ?? sch.hour ?? "";
  const obs = sch.observacoes ?? sch.observações ?? sch.observations ?? sch.notes ?? sch.note ?? "";
  let dstr = "";
  if (rawDate) {
    const s = String(rawDate);
    const iso = s.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      dstr = `${dd}/${mm}/${d.getFullYear()}`;
    } else {
      dstr = s;
    }
  }
  const tstr = rawTime ? String(rawTime).slice(0, 5) : "";
  const parts: string[] = [];
  if (dstr && tstr) parts.push(`${dstr} às ${tstr}`);
  else if (dstr) parts.push(dstr);
  else if (tstr) parts.push(tstr);
  if (obs) parts.push(`(${String(obs).trim()})`);
  return parts.join(" ").trim();
}

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
  const phoneIndex = new Map<string, Lead>();
  for (const l of leads) {
    const p = normalizePhoneForMatch(l.phone || l.whatsapp);
    if (p && !phoneIndex.has(p)) phoneIndex.set(p, l);
  }

  let appended = 0;
  const okIds: string[] = [];
  const failed: Array<{ id: string; error: string; dados: any }> = [];

  for (const row of rows) {
    try {
      const phone = row.phone_normalized || normalizePhoneForMatch(row.dados?.destinationRaw);
      if (!phone) {
        failed.push({ id: row.id, error: "missing_phone", dados: row.dados });
        continue;
      }
      const lead = phoneIndex.get(phone);
      if (!lead) {
        failed.push({ id: row.id, error: `lead_not_found:${phone}`, dados: row.dados });
        continue;
      }

      const interaction = buildInteractionFromInbound(row, lead);
      const withId = {
        id: (globalThis.crypto?.randomUUID?.() as string | undefined) ??
          `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...interaction,
      };
      lead.interactions = [...((lead.interactions as any[]) || []), withId];
      appended++;
      okIds.push(row.id);
    } catch (e: any) {
      failed.push({ id: row.id, error: e?.message || String(e), dados: row.dados });
    }
  }

  if (appended > 0) {
    usave<Lead[]>("p21_leads", leads);
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
  }
  return appended;
}

// Alias público — para uso manual (ex.: botão de UI).
export async function pullInboundInteractions(): Promise<number> {
  return syncInboundInteractions();
}


