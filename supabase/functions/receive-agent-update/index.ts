// Public webhook: recebe atualização de status dos agentes de prospecção
// WhatsApp (Solar e Alimentação, rodando no Railway) a cada marco real da
// conversa (saudação, decisor confirmado, reunião marcada, etc — nunca a
// cada mensagem). Contrato vem de notify_crm() em reply_agent.py, idêntico
// nos dois agentes.
//
// Decisão de integração (2026-09-03): os status do agente (Saudacao
// Enviada, Aguardando Decisor, Audio Enviado, Em Qualificacao...) não
// correspondem às etapas reais do pipeline Cold Call (Novo Lead, Tentativa
// 1..9) — mapear 1:1 criaria etapas fantasma que não existem no Kanban.
// Em vez disso:
//   - Lead já existe no CRM (achado pelo telefone em user_storage/p21_leads):
//     grava uma Interação (tipo WhatsApp) com o status/mensagem/próxima ação
//     do agente. SÓ move a etapa de verdade quando o status é
//     "Reuniao Marcada" (etapa real do pipeline Oportunidades) ou um dos
//     status de encerramento (etapa "Tentativas Concluídas" do Cold Call).
//     "Numero Invalido" marca phoneInvalid, sem mudar etapa.
//   - Lead não existe ainda (telefone novo pro agente): cai na fila
//     leads_inbound, mesma fila que a Landing Page já usa — aparece no
//     botão "Caixa de entrada" do Pipeline pra o vendedor importar.

import { createClient } from "npm:@supabase/supabase-js@2";
import { constantTimeEqual, readWebhookJson } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
};

const MEETING_STAGE = "Reunião Marcada";
const CLOSED_STAGE = "Tentativas Concluídas";
const CLOSED_STATUSES = new Set(["Nao Quer", "Nao Contatar", "Tentativas Encerradas"]);
const INVALID_STATUS = "Numero Invalido";

interface AgentPayload {
  phone?: string;
  message?: string;
  status?: string;
  nextAction?: string;
  dispatchId?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_WEBHOOK_SECRET = Deno.env.get("AGENT_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { error: "server_misconfigured" });
  if (!AGENT_WEBHOOK_SECRET) {
    console.error("[receive-agent-update] AGENT_WEBHOOK_SECRET not configured");
    return json(500, { error: "server_misconfigured" });
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!provided || !constantTimeEqual(provided, AGENT_WEBHOOK_SECRET)) {
    console.warn("[receive-agent-update] unauthorized request", {
      hasCredential: Boolean(provided),
      userAgent: req.headers.get("user-agent")?.slice(0, 120) ?? "unknown",
    });
    return json(401, { error: "unauthorized" });
  }

  const parsed = await readWebhookJson(req);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const payload = parsed.value as AgentPayload;

  const phoneNormalized = normalizePhone(payload.phone);
  if (!phoneNormalized) return json(400, { error: "phone_obrigatorio" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const status = (payload.status || "").trim();
  const nowISO = new Date().toISOString();
  const summaryParts = [payload.message?.trim()].filter(Boolean) as string[];
  if (payload.nextAction?.trim()) summaryParts.push(`Próxima ação sugerida: ${payload.nextAction.trim()}`);
  const summary = summaryParts.join("\n") || `Status atualizado pelo agente: ${status || "desconhecido"}`;

  const interaction = {
    id: crypto.randomUUID(),
    type: "WhatsApp" as const,
    date: nowISO,
    createdAt: nowISO,
    title: status ? `Agente de prospecção — ${status}` : "Agente de prospecção",
    summary,
  };

  // Procura o lead pelo telefone em todas as contas (na prática, uma só).
  const { data: storageRows, error: storageErr } = await admin
    .from("user_storage")
    .select("user_id, value")
    .eq("key", "p21_leads");

  if (storageErr) {
    console.error("[receive-agent-update] user_storage read failed", storageErr);
    return json(500, { error: "storage_read_failed", details: storageErr.message });
  }

  for (const row of storageRows ?? []) {
    const leads = (row.value as any[]) || [];
    const idx = leads.findIndex((l) => {
      const p1 = normalizePhone(l.phone);
      const p2 = normalizePhone(l.whatsapp);
      const p3 = normalizePhone(l.phoneNormalized);
      return (p1 && p1 === phoneNormalized) || (p2 && p2 === phoneNormalized) || (p3 && p3 === phoneNormalized);
    });

    if (idx !== -1) {
      const lead = { ...leads[idx] };
      lead.interactions = [...(lead.interactions || []), interaction];

      if (status === MEETING_STAGE) {
        lead.stage = MEETING_STAGE;
        lead.stageChangedAt = nowISO;
      } else if (CLOSED_STATUSES.has(status)) {
        lead.stage = CLOSED_STAGE;
        lead.stageChangedAt = nowISO;
      } else if (status === INVALID_STATUS) {
        lead.phoneInvalid = true;
      }

      leads[idx] = lead;
      const { error: updErr } = await admin
        .from("user_storage")
        .update({ value: leads, updated_at: nowISO })
        .eq("user_id", row.user_id)
        .eq("key", "p21_leads");

      if (updErr) {
        console.error("[receive-agent-update] user_storage update failed", updErr);
        return json(500, { error: "storage_update_failed", details: updErr.message });
      }

      console.log(`[receive-agent-update] lead matched by phone, stage=${lead.stage}`);
      return json(200, { ok: true, matched: true, leadId: lead.id, stage: lead.stage });
    }
  }

  // Telefone não encontrado em nenhum lead existente — enfileira, mesma
  // fila que a Landing Page já usa (aparece em "Caixa de entrada").
  const dados = {
    contact: "",
    company: "",
    phone: payload.phone || "",
    notes: summary,
    source: "whatsapp_agent",
    receivedAt: nowISO,
    raw: payload,
  };
  const { data: inserted, error: insErr } = await admin
    .from("leads_inbound")
    .insert({ dados })
    .select("id")
    .single();

  if (insErr) {
    console.error("[receive-agent-update] leads_inbound insert failed", insErr);
    return json(500, { error: "inbound_write_failed", details: insErr.message });
  }

  console.log(`[receive-agent-update] no lead matched, queued in leads_inbound: ${inserted.id}`);
  return json(200, { ok: true, matched: false, queued: true, id: inserted.id });
});
