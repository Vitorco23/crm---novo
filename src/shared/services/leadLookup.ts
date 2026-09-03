// ============================================================================
// LEAD LOOKUP — busca determinística de UM lead específico por nome/empresa,
// para o Comando (ver auditoria "Comando/Diretor Comercial IA", 03/09).
//
// Objetivo: quando o usuário menciona um lead pelo nome no chat, encontrar
// esse lead pelos dados reais do CRM (getLeads()), SEM depender de score,
// prioridade, autoDiagnosis ou top-15 do priorityEngine. Zero IA aqui —
// é busca por substring determinística, mesmo espírito de
// leadImport.ts (normalizeText) e commercialContext.ts (mesmas fontes).
//
// Não substitui `computePriorities()` nem `getCommercialContext()` — é um
// caminho paralelo, só ativado quando a pergunta parece citar um lead.
// ============================================================================

import { getLeads, getMeetings, type Lead, type Interaction, type CallNote } from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import { getTasks } from "@/modules/leads/services/leadTasks";

const MAX_INTERACTIONS = 10;
const MIN_COMPANY_LEN = 3;

// Faixa Unicode dos diacríticos combinantes (U+0300–U+036F) — construída via
// codepoint explícito pra nunca depender de como o editor grava o caractere
// literal no arquivo-fonte.
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(value: string | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/**
 * Procura, dentre os leads reais do CRM, aquele cujo nome de empresa aparece
 * mencionado no texto da pergunta. Determinístico: substring match sobre
 * texto normalizado (sem acento, minúsculo) — nunca IA, nunca score.
 * Em caso de mais de um lead compatível, vence o nome de empresa mais
 * específico (string mais longa) — evita falso positivo por nome curto.
 */
export function findMentionedLead(message: string, leads: Lead[] = getLeads()): Lead | null {
  const text = normalize(message);
  if (!text) return null;

  let best: Lead | null = null;
  let bestLen = 0;
  for (const lead of leads) {
    const company = normalize(lead.company);
    if (company.length < MIN_COMPANY_LEN) continue;
    if (text.includes(company) && company.length > bestLen) {
      best = lead;
      bestLen = company.length;
    }
  }
  return best;
}

export interface LeadContextInteraction {
  data: string;
  tipo: string;
  resumo: string;
}

export interface LeadContextBlock {
  encontrado: true;
  id: string;
  empresa: string;
  contato?: string;
  telefone?: string;
  cidade?: string;
  nicho?: string;
  etapa: string;
  tags?: string[];
  valorContrato?: number;
  notas?: string;
  autoDiagnostico?: Lead["autoDiagnosis"];
  ultimaInteracaoEm?: string;
  interacoesRecentes: LeadContextInteraction[];
  tarefasAbertas: { titulo: string; prazo: string; prioridade: string }[];
  proximaReuniao: { data: string; hora: string; canal: string } | null;
  followUpsPendentes: { titulo: string; agendadoPara: string }[];
}

function interactionDate(i: Interaction): string {
  return i.date || i.createdAt || "";
}

function callNoteToInteraction(c: CallNote): LeadContextInteraction {
  const resumo = c.analysis?.data?.resumoExecutivo || c.text || "";
  return { data: c.createdAt, tipo: "Ligação (nota)", resumo };
}

/**
 * Monta o bloco de contexto de UM lead já localizado — reaproveita as
 * mesmas fontes de dado já usadas em commercialContext.ts (getMeetings,
 * getReminders, getTasks), nunca cria fonte paralela nova.
 */
export function buildLeadContextBlock(lead: Lead): LeadContextBlock {
  const interactions = (lead.interactions || []).map((i): LeadContextInteraction => ({
    data: interactionDate(i),
    tipo: i.type,
    resumo: i.summary || i.title || "",
  }));
  const callNoteInteractions = (lead.callNotes || []).map(callNoteToInteraction);

  const merged = [...interactions, ...callNoteInteractions]
    .filter((i) => i.data)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, MAX_INTERACTIONS);

  const ultimaInteracaoEm = merged[0]?.data;

  const tarefasAbertas = getTasks()
    .filter((t) => t.leadId === lead.id && t.status === "pendente")
    .map((t) => ({ titulo: t.title, prazo: t.dueAt, prioridade: t.priority }));

  const followUpsPendentes = getReminders()
    .filter((r) => r.leadId === lead.id && r.status === "pending")
    .map((r) => ({ titulo: r.title, agendadoPara: r.scheduledFor }));

  const nowMs = Date.now();
  const proxima = getMeetings()
    .filter((m) => m.leadId === lead.id)
    .map((m) => ({ data: m.date, hora: m.time, canal: m.channel, atMs: new Date(`${m.date}T${m.time || "00:00"}:00`).getTime() }))
    .filter((m) => Number.isFinite(m.atMs) && m.atMs >= nowMs)
    .sort((a, b) => a.atMs - b.atMs)[0] || null;

  return {
    encontrado: true,
    id: lead.id,
    empresa: lead.company,
    contato: lead.contact,
    telefone: lead.phone,
    cidade: lead.city,
    nicho: lead.niche,
    etapa: lead.stage,
    tags: lead.tags,
    valorContrato: lead.contractValue,
    notas: lead.notes,
    autoDiagnostico: lead.autoDiagnosis,
    ultimaInteracaoEm,
    interacoesRecentes: merged,
    tarefasAbertas,
    proximaReuniao: proxima ? { data: proxima.data, hora: proxima.hora, canal: proxima.canal } : null,
    followUpsPendentes,
  };
}
