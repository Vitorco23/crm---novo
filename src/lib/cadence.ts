// ===== Motor de Cadência Cold Call =====
// Estrutura fixa de 10 dias. O conteúdo (scripts, objetivos) troca por nicho.
// Nenhum efeito colateral — apenas resolução determinística de passo.

import type { Lead } from "./store";

export type CadenceChannel = "Ligação" | "WhatsApp" | "Instagram" | "E-mail";

export interface CadenceStep {
  day: number;             // D1..D10
  attempt: number;         // 1..10
  channel: CadenceChannel;
  objective: string;       // ex: "Gerar reflexão"
  nextAction: string;      // resumo curto para o card
  script: string;          // script completo (painel lateral)
  estimatedMinutes: number;
}

export interface NicheCadence {
  niche: string;
  steps: CadenceStep[];
}

// Cadência genérica (10 passos) — usada quando o nicho não tem cadência própria.
export const DEFAULT_CADENCE: CadenceStep[] = [
  {
    day: 1, attempt: 1, channel: "Ligação",
    objective: "Gerar reflexão",
    nextAction: "Ligação de apresentação",
    script:
      "Oi, {nome}? Aqui é {vendedor} da Performance21. Estou ligando porque acompanhei rapidamente o {empresa} e percebi um ponto específico que provavelmente está travando crescimento de vocês. Você tem 2 minutos pra eu compartilhar?",
    estimatedMinutes: 5,
  },
  {
    day: 2, attempt: 2, channel: "WhatsApp",
    objective: "Reforço com contexto",
    nextAction: "Enviar mensagem de valor",
    script:
      "Oi {nome}! Aqui é {vendedor}. Tentei ligação ontem sem sucesso. Rapidinho: identifiquei um gargalo comercial recorrente em empresas do porte de {empresa}. Posso te mandar um insight de 30s?",
    estimatedMinutes: 3,
  },
  {
    day: 3, attempt: 3, channel: "Ligação",
    objective: "Retomar contato",
    nextAction: "Segunda tentativa de ligação",
    script:
      "Oi {nome}, {vendedor} de novo aqui. Não quero te tomar tempo — só queria validar se faz sentido a gente trocar uma ideia rápida sobre previsibilidade comercial no {empresa}. Prefere agora ou marcamos 10 min?",
    estimatedMinutes: 5,
  },
  {
    day: 4, attempt: 4, channel: "Instagram",
    objective: "Estabelecer presença",
    nextAction: "Curtir/comentar posts recentes",
    script:
      "Curtir os últimos 2-3 posts do {empresa} no Instagram e deixar 1 comentário genuíno (sem pitch). Objetivo: entrar no radar sem parecer venda.",
    estimatedMinutes: 3,
  },
  {
    day: 5, attempt: 5, channel: "Ligação",
    objective: "Persistência qualificada",
    nextAction: "Terceira ligação — tom mais direto",
    script:
      "Oi {nome}, é o {vendedor}. Já tentei algumas vezes — não é insistência à toa. O que me faz continuar é que empresas parecidas com a sua fecharam 3-5 reuniões extras/semana no primeiro mês com a gente. Consegue 5 minutos essa semana?",
    estimatedMinutes: 5,
  },
  {
    day: 6, attempt: 6, channel: "WhatsApp",
    objective: "Entregar valor",
    nextAction: "Enviar Microinsight",
    script:
      "{nome}, prometo não encher: segue 1 insight prático que você pode aplicar hoje no comercial do {empresa} — mesmo sem falar com a gente: [inserir microinsight]. Se fizer sentido, marcamos 15 min pra eu te mostrar o método completo.",
    estimatedMinutes: 4,
  },
  {
    day: 7, attempt: 7, channel: "Instagram",
    objective: "Aproximação social",
    nextAction: "Interagir com Story",
    script:
      "Responder um Story recente do {nome}/{empresa} com uma observação real, humana. Sem link, sem pitch. Objetivo: virar rosto conhecido.",
    estimatedMinutes: 2,
  },
  {
    day: 8, attempt: 8, channel: "Ligação",
    objective: "Última tentativa forte",
    nextAction: "Ligação decisiva",
    script:
      "{nome}, {vendedor}. Última ligação minha essa semana — depois eu paro. Só queria confirmar: faz sentido a gente conversar sobre previsibilidade comercial ou você prefere que eu não te procure mais nesse tema?",
    estimatedMinutes: 5,
  },
  {
    day: 9, attempt: 9, channel: "E-mail",
    objective: "Break-up formal",
    nextAction: "Enviar e-mail de despedida",
    script:
      "Assunto: Encerrando contato — {empresa}\n\n{nome}, tentei algumas vezes por telefone e WhatsApp sem retorno. Vou assumir que agora não é o momento. Deixo aqui meu contato pra quando fizer sentido. Sucesso — {vendedor}.",
    estimatedMinutes: 4,
  },
  {
    day: 10, attempt: 10, channel: "WhatsApp",
    objective: "Despedida",
    nextAction: "Última mensagem — porta aberta",
    script:
      "{nome}, essa é minha última mensagem. Sem hard feelings. Se algum dia quiser trocar ideia sobre previsibilidade comercial, estou aqui. Abraço — {vendedor}.",
    estimatedMinutes: 2,
  },
];

const NICHE_OVERRIDES: Record<string, CadenceStep[]> = {
  // Iteração futura: cadências customizadas por nicho.
};

const OVERRIDES_KEY = "p21_cadence_overrides";

function readOverrides(): Record<string, CadenceStep[]> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeOverrides(map: Record<string, CadenceStep[]>) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map)); } catch {}
  try { window.dispatchEvent(new CustomEvent("p21:cadence-changed")); } catch {}
}

function nicheKey(niche?: string): string {
  return (niche || "").trim().toLowerCase() || "__default__";
}

export function getCadenceForNiche(niche?: string): CadenceStep[] {
  const key = nicheKey(niche);
  const overrides = readOverrides();
  if (overrides[key]?.length) return overrides[key];
  if (niche && NICHE_OVERRIDES[key]) return NICHE_OVERRIDES[key];
  return DEFAULT_CADENCE;
}

export function saveCadenceForNiche(niche: string | undefined, steps: CadenceStep[]) {
  const map = readOverrides();
  map[nicheKey(niche)] = steps;
  writeOverrides(map);
}

export function resetCadenceForNiche(niche?: string) {
  const map = readOverrides();
  delete map[nicheKey(niche)];
  writeOverrides(map);
}

/** Resolve o passo da cadência a partir do stage atual do lead. */
export function getStepForLead(lead: Lead): CadenceStep | null {
  const stage = (lead.stage || "").trim();
  const cadence = getCadenceForNiche(lead.niche);
  if (/^novo lead$/i.test(stage)) return cadence[0] || null;
  const m = stage.match(/tentativa\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= cadence.length) return cadence[n - 1];
  }
  return null;
}

/** "Hoje", "Atrasado 3d", "Novo" — momento da execução baseado em stageChangedAt. */
export function executionMoment(lead: Lead): string {
  const t = new Date(lead.stageChangedAt).getTime();
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `Atrasado ${days}d`;
}
