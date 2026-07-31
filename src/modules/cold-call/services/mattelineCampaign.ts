// Motor de campanhas automáticas Matteline.
// Reutiliza a Edge Function existente `matteline-create-contact`.
// Sem UI aqui: apenas seleção, envio, persistência e histórico.

import { supabase } from "@/integrations/supabase/client";
import { getLeads, saveLeads, type Lead } from "@/shared/services/store";
import { uload, usave, normalizePhoneBR } from "@/shared/services/userStorage";

const DIAL_HISTORY_KEY = "p21_dial_history";

export interface DialHistoryEntry {
  id: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  company: string;
  phone: string;
  attempt: number;
  status: "enviado" | "erro";
  error?: string;
  contactId?: string;
  at: string;
}

export function getDialHistory(): DialHistoryEntry[] {
  return uload<DialHistoryEntry[]>(DIAL_HISTORY_KEY, []);
}

function appendDialHistory(entries: DialHistoryEntry[]) {
  if (entries.length === 0) return;
  const all = [...entries, ...getDialHistory()].slice(0, 5000);
  usave<DialHistoryEntry[]>(DIAL_HISTORY_KEY, all);
}

/** Tentativa exibida ao usuário (0 = Novos Leads). */
export const ATTEMPT_OPTIONS = [
  { value: 0, label: "Novos Leads", short: "Novos" },
  { value: 1, label: "Tentativa 1", short: "T1" },
  { value: 2, label: "Tentativa 2", short: "T2" },
  { value: 3, label: "Tentativa 3", short: "T3" },
  { value: 4, label: "Tentativa 4", short: "T4" },
  { value: 5, label: "Tentativa 5", short: "T5" },
] as const;

export function attemptShortLabel(attempt: number): string {
  return ATTEMPT_OPTIONS.find((o) => o.value === attempt)?.short ?? `T${attempt}`;
}

export function attemptLabel(attempt: number): string {
  return ATTEMPT_OPTIONS.find((o) => o.value === attempt)?.label ?? `Tentativa ${attempt}`;
}

/** Nome automático: "Nicho - Cidade - Tentativa" (partes ausentes são omitidas). */
export function buildCampaignName(opts: {
  niches: string[];
  cities: string[];
  attempt: number;
}): string {
  const parts: string[] = [];
  if (opts.niches.length > 0) parts.push(opts.niches.slice(0, 2).join(" / "));
  if (opts.cities.length > 0) parts.push(opts.cities.slice(0, 2).join(" / "));
  parts.push(attemptShortLabel(opts.attempt));
  return parts.join(" - ");
}

export function isValidDialPhone(raw?: string): boolean {
  if (!raw) return false;
  const p = normalizePhoneBR(raw);
  return p.length >= 12 && p.length <= 15;
}

/** Leads filtrados que possuem a tentativa escolhida e telefone válido, sem duplicados. */
export function selectCampaignLeads(filteredLeads: Lead[], attempt: number): Lead[] {
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();
  const out: Lead[] = [];
  for (const l of filteredLeads) {
    if ((l.dialAttempts ?? 0) !== attempt) continue;
    if (l.phoneInvalid) continue;
    if (!isValidDialPhone(l.phone)) continue;
    const phone = normalizePhoneBR(l.phone);
    if (seenIds.has(l.id) || seenPhones.has(phone)) continue;
    seenIds.add(l.id);
    seenPhones.add(phone);
    out.push(l);
  }
  return out;
}

export interface CampaignResult {
  campaignId: string;
  campaignName: string;
  sent: number;
  errors: number;
  elapsedMs: number;
}

interface RunOptions {
  leads: Lead[];
  campaignName: string;
  attempt: number;
  onProgress?: (done: number, total: number) => void;
}

/** Envia os contatos ao Matteline (não inicia a campanha lá). */
export async function runMattelineCampaign(opts: RunOptions): Promise<CampaignResult> {
  const { leads, campaignName, attempt, onProgress } = opts;
  const campaignId = crypto.randomUUID();
  const startedAt = Date.now();
  const total = leads.length;

  const history: DialHistoryEntry[] = [];
  const updates = new Map<string, Partial<Lead>>();
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < total; i++) {
    const lead = leads[i];
    const phone = normalizePhoneBR(lead.phone);
    const name = (lead.company || lead.contact || "Contato").slice(0, 200);
    const at = new Date().toISOString();
    let status: "enviado" | "erro" = "enviado";
    let errorMsg: string | undefined;
    let contactId: string | undefined;

    try {
      const { data, error } = await supabase.functions.invoke("matteline-create-contact", {
        body: { name, phone },
      });
      if (error) {
        status = "erro";
        errorMsg = error.message;
      } else {
        const payload = data as { ok?: boolean; matteline?: unknown } | null;
        if (payload && payload.ok === false) {
          status = "erro";
          errorMsg = "Matteline recusou o contato";
        }
        const m = payload?.matteline as { id?: string; data?: { id?: string } } | undefined;
        contactId = m?.id ?? m?.data?.id;
      }
    } catch (err) {
      status = "erro";
      errorMsg = err instanceof Error ? err.message : "erro_desconhecido";
    }

    if (status === "enviado") sent++;
    else errors++;

    history.push({
      id: crypto.randomUUID(),
      campaignId,
      campaignName,
      leadId: lead.id,
      company: lead.company,
      phone,
      attempt,
      status,
      error: errorMsg,
      contactId,
      at,
    });

    if (status === "enviado") {
      updates.set(lead.id, {
        dialAttempts: attempt + 1,
        lastDialSentAt: at,
        lastDialCampaign: campaignName,
        lastDialCampaignId: campaignId,
        lastDialContactId: contactId,
        dialStatus: "enviado",
      });
    } else {
      updates.set(lead.id, {
        lastDialSentAt: at,
        lastDialCampaign: campaignName,
        lastDialCampaignId: campaignId,
        dialStatus: "erro",
      });
    }

    onProgress?.(i + 1, total);
  }

  if (updates.size > 0) {
    const all = getLeads().map((l) => (updates.has(l.id) ? { ...l, ...updates.get(l.id)! } : l));
    saveLeads(all);
  }
  appendDialHistory(history);

  return { campaignId, campaignName, sent, errors, elapsedMs: Date.now() - startedAt };
}
