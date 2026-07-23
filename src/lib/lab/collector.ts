// Laboratório Comercial — Coleta de dados.
// Consome as fontes existentes (leads, movements, sessions, meetings, finance)
// SEM duplicar. Aplica filtros globais e devolve um dataset normalizado.
// Constituição §3 (consultas consolidadas), §12 (filtros globais), §13 (estado único).

import { getLeads, getMovementEvents, getSessions, getMeetings,
  type Lead, type MovementEvent, type PomodoroSession, type Meeting } from "@/lib/store";
import { getCallLogs, type CallLog } from "@/lib/scripts";
import { getTransactions, type FinanceTransaction } from "@/lib/finance";
import type { LabDateRange, LabFilters } from "./types";

// ---------- normalização ----------
export function norm(s: string | undefined | null): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();
}
const CAMPAIGN_SPLIT = /\s+[-–—]\s+/;
export function parseNicheField(niche: string) {
  const raw = (niche || "").trim();
  if (!raw) return { niche: "", cityFromCampaign: "" };
  if (CAMPAIGN_SPLIT.test(raw)) {
    const [n, c] = raw.split(CAMPAIGN_SPLIT);
    return { niche: (n || "").trim(), cityFromCampaign: (c || "").trim() };
  }
  return { niche: raw, cityFromCampaign: "" };
}
export function resolveSegments(lead: Lead) {
  const parsed = parseNicheField(lead.niche || "");
  const cityDisplay = (lead.city || "").trim() || parsed.cityFromCampaign;
  const nicheDisplay = parsed.niche;
  return {
    cityKey: norm(cityDisplay),
    cityDisplay,
    nicheKey: norm(nicheDisplay),
    nicheDisplay,
    campaignKey: `${norm(nicheDisplay)}||${norm(cityDisplay)}`,
    campaignDisplay: nicheDisplay && cityDisplay
      ? `${nicheDisplay} — ${cityDisplay}`
      : nicheDisplay || cityDisplay || "(sem campanha)",
  };
}

// ---------- período ----------
export function resolveRange(f: LabFilters): LabDateRange {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  switch (f.period) {
    case "today": return { start, end };
    case "last7":  start.setDate(start.getDate() - 6); return { start, end };
    case "last30": start.setDate(start.getDate() - 29); return { start, end };
    case "last90": start.setDate(start.getDate() - 89); return { start, end };
    case "thisMonth":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case "custom": {
      const s = f.customStart ? new Date(f.customStart) : start;
      const e = f.customEnd ? new Date(f.customEnd) : end;
      s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
  }
}

// ---------- dataset consolidado ----------
export interface LabDataset {
  filters: LabFilters;
  range: LabDateRange;
  leads: Lead[];
  events: MovementEvent[];
  sessions: PomodoroSession[];
  meetings: Meeting[];
  callLogs: CallLog[];
  transactions: FinanceTransaction[];
  leadById: Map<string, Lead>;
  // opções derivadas p/ preencher selects
  options: {
    niches: { key: string; label: string }[];
    campaigns: { key: string; label: string }[];
    cities: { key: string; label: string }[];
    scripts: string[];
  };
}

export function buildDataset(filters: LabFilters): LabDataset {
  const range = resolveRange(filters);
  const allLeads = getLeads();
  const leadById = new Map(allLeads.map((l) => [l.id, l]));

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return !isNaN(t) && t >= range.start.getTime() && t <= range.end.getTime();
  };

  const matchesSegment = (l: Lead | undefined) => {
    if (!l) return false;
    const seg = resolveSegments(l);
    if (filters.niche !== "all" && seg.nicheKey !== filters.niche) return false;
    if (filters.campaign !== "all" && seg.campaignKey !== filters.campaign) return false;
    if (filters.city !== "all" && seg.cityKey !== filters.city) return false;
    return true;
  };

  // opções canônicas
  const nicheMap = new Map<string, string>();
  const campaignMap = new Map<string, string>();
  const cityMap = new Map<string, string>();
  const scriptSet = new Set<string>();
  for (const l of allLeads) {
    const seg = resolveSegments(l);
    if (seg.nicheKey && !nicheMap.has(seg.nicheKey)) nicheMap.set(seg.nicheKey, seg.nicheDisplay);
    if (seg.cityKey && !cityMap.has(seg.cityKey)) cityMap.set(seg.cityKey, seg.cityDisplay);
    if (seg.nicheKey && seg.cityKey && !campaignMap.has(seg.campaignKey))
      campaignMap.set(seg.campaignKey, seg.campaignDisplay);
  }
  for (const s of getSessions()) if (s.scriptUsed) scriptSet.add(s.scriptUsed);
  for (const c of getCallLogs()) if (c.scriptUsed) scriptSet.add(c.scriptUsed);

  const leads = allLeads.filter((l) => matchesSegment(l) && inRange(l.createdAt));
  const events = getMovementEvents().filter((e) => inRange(e.timestamp) && matchesSegment(leadById.get(e.leadId)));
  const meetings = getMeetings().filter((m) => {
    const iso = `${m.date}T${m.time || "00:00"}:00`;
    return inRange(iso) && matchesSegment(leadById.get(m.leadId));
  });
  const sessions = getSessions().filter((s) => {
    if (!inRange(s.startTime)) return false;
    if (filters.niche !== "all") {
      const p = parseNicheField(s.niche || "");
      if (norm(p.niche) !== filters.niche) return false;
    }
    if (filters.script !== "all" && s.scriptUsed !== filters.script) return false;
    return true;
  });
  const callLogs = getCallLogs().filter((c) => {
    if (!inRange(c.timestamp)) return false;
    if (filters.script !== "all" && c.scriptUsed !== filters.script) return false;
    if (c.leadId && !matchesSegment(leadById.get(c.leadId))) return false;
    return true;
  });
  const transactions = getTransactions().filter((t) => {
    if (t.kind !== "revenue") return true;
    if (!inRange(t.date)) return false;
    if (t.clientId && !matchesSegment(leadById.get(t.clientId))) return false;
    return true;
  });

  return {
    filters, range, leads, events, sessions, meetings, callLogs, transactions, leadById,
    options: {
      niches: [...nicheMap].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
      campaigns: [...campaignMap].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
      cities: [...cityMap].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
      scripts: [...scriptSet].sort(),
    },
  };
}
