// src/modules/leads/services/cadence.ts
// Motor de Cadência SOC (System Operating Commercial)
// Arquitetura T0-T9 baseada em TENTATIVAS, não dias.

import type { Lead } from "@/shared/services/store";
import { uload, usave } from "@/shared/services/userStorage";

export type CadenceChannel = "Ligação" | "WhatsApp" | "Instagram" | "E-mail";

export interface CadenceStep {
  attempt: number;         // 0..9
  channel: CadenceChannel;
  objective: string;
  nextAction: string;
  script: string;
  estimatedMinutes: number;
  day?: number;            // Legado para compatibilidade
}

export interface NicheCadence {
  niche: string;
  steps: CadenceStep[];
}

// 1. Normalização de Nicho (Aliases)
export function normalizeNiche(niche?: string): string {
  const n = (niche || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos

  if (!n) return "__default__";

  // Grupos
  if (["academia"].includes(n)) return "academia";
  if (["delivery", "restaurante", "hamburgueria", "pizzaria", "sushi"].includes(n)) return "alimentação";
  if (["clinica odontologica", "harmonizacao", "clinica de estetica", "clinica"].includes(n)) return "clínicas";
  if (["energia solar", "solar"].includes(n)) return "energia solar";
  if (["imobiliaria"].includes(n)) return "imobiliária";
  if (["marmoraria"].includes(n)) return "marmoraria";

  return n;
}

// 2. Processamento de Variáveis
export function processTemplate(template: string, lead: Lead, userName?: string): string {
  if (!template) return "";

  // {vendedor} - Primeiro nome do usuário autenticado
  const sellerFirstName = userName ? userName.split(" ")[0] : "{vendedor}";
  
  // {nome} - Decisor do lead
  const decisor = lead.contact?.trim();
  const namePlaceholder = decisor || "{nome}";

  // {empresa} - Empresa do lead
  const companyName = lead.company || "{empresa}";

  return template
    .replace(/{vendedor}/gi, sellerFirstName)
    .replace(/{nome}/gi, namePlaceholder)
    .replace(/{empresa}/gi, companyName);
}

// 3. Arquitetura Padrão SOC T0-T9
const createDefaultSteps = (niche: string): CadenceStep[] => {
  const norm = normalizeNiche(niche);
  
  const steps: CadenceStep[] = [
    {
      attempt: 0, channel: "Ligação",
      objective: "Primeiro contato",
      nextAction: "Contato inicial (T0)",
      script: "Oi, {nome}? Aqui é {vendedor} da Performance21. Primeiro contato: quero entender rapidamente como está o comercial do {empresa} hoje. Você tem 2 minutos?",
      estimatedMinutes: 5,
    },
    {
      attempt: 1, channel: "WhatsApp",
      objective: "Contextualizar a tentativa de ligação anterior",
      nextAction: "Enviar T1 WhatsApp",
      script: "Olá, {nome}! Aqui é o {vendedor}, da Performance21. Tentei falar contigo por telefone mais cedo porque estou fazendo um levantamento com algumas empresas do setor de vocês. Queria entender se é contigo mesmo que trato da parte comercial da {empresa} ou se existe outro responsável por aí.",
      estimatedMinutes: 3,
    },
    {
      attempt: 2, channel: "Ligação",
      objective: "Nova tentativa de conexão",
      nextAction: "Ligação T2",
      script: "Nova tentativa de ligação. Utilizar abordagem de cold call e buscar conexão com o decisor.",
      estimatedMinutes: 5,
    },
    {
      attempt: 3, channel: "Instagram",
      objective: "Gerar familiaridade sem pitch agressivo",
      nextAction: "Interação T3 Instagram",
      script: "Localize o Instagram da empresa. Siga o perfil caso faça sentido e interaja de forma natural com um conteúdo recente ou Story. Evite fazer pitch nesta etapa. O objetivo é fazer o nome/perfil entrar no radar do decisor.",
      estimatedMinutes: 3,
    },
    {
      attempt: 4, channel: "WhatsApp",
      objective: "Abordagem específica do nicho",
      nextAction: "Enviar T4 Específico",
      script: getNicheT4(norm),
      estimatedMinutes: 5,
    },
    {
      attempt: 5, channel: "Ligação",
      objective: "Nova tentativa de conexão",
      nextAction: "Ligação T5",
      script: "Nova tentativa de ligação. O lead já recebeu outros pontos de contato. Evite reiniciar toda a apresentação como se fosse o primeiro contato.",
      estimatedMinutes: 5,
    },
    {
      attempt: 6, channel: "WhatsApp",
      objective: "Insight ou provocação comercial",
      nextAction: "Enviar T6 Insight",
      script: getNicheT6(norm),
      estimatedMinutes: 5,
    },
    {
      attempt: 7, channel: "Ligação",
      objective: "Abordagem mais direta",
      nextAction: "Ligação T7",
      script: "Tentativa direta. O lead já recebeu múltiplos contatos. Busque uma definição sobre existir ou não relevância no assunto, sem repetir toda a apresentação inicial.",
      estimatedMinutes: 5,
    },
    {
      attempt: 8, channel: "Instagram",
      objective: "Nova interação e familiaridade",
      nextAction: "Interação T8 Instagram",
      script: "Verifique novamente o Instagram da empresa/decisor. Caso exista conteúdo ou Story que permita interação genuína, responda ou interaja naturalmente. Não envie pitch genérico apenas para cumprir a cadência.",
      estimatedMinutes: 3,
    },
    {
      attempt: 9, channel: "Ligação",
      objective: "Última tentativa ativa",
      nextAction: "Ligação Final T9",
      script: "Última tentativa ativa desta cadência. Buscar uma definição: existe relevância para conversar agora ou o contato deve sair da prospecção ativa?",
      estimatedMinutes: 5,
    },
  ];
  return steps;
};

function getNicheT4(norm: string): string {
  if (norm === "academia") return "{nome}, um dos pontos que estamos analisando em academias é quanto dinheiro acaba ficando pelo caminho entre pessoas que pedem informações, fazem aula experimental ou demonstram interesse e aquelas que realmente viram matrícula. Além disso, estamos olhando retenção e recuperação de ex-alunos. Como vocês trabalham isso hoje na {empresa}?";
  if (norm === "alimentação") return "{nome}, um dos pontos que estamos analisando em operações de alimentação é a dependência dos marketplaces e principalmente o que acontece depois da primeira compra. Muita operação vende bem, mas aproveita pouco a própria base para gerar recompra, aumentar frequência e reduzir dependência das plataformas. Como vocês trabalham isso hoje na {empresa}?";
  if (norm === "clínicas") return "{nome}, um dos pontos que estamos analisando em clínicas é o que acontece entre o primeiro contato do paciente e o fechamento do procedimento. Principalmente pacientes que pedem informações, agendam avaliação, não comparecem ou recebem orçamento e não avançam. Como vocês trabalham essa recuperação hoje na {empresa}?";
  if (norm === "energia solar") return "{nome}, um dos pontos que estamos analisando no mercado solar é o volume de propostas e oportunidades que acabam esfriando depois do primeiro contato. Principalmente follow-up, propostas esquecidas, disputa por preço e recuperação de oportunidades antigas. Como vocês trabalham isso hoje na {empresa}?";
  if (norm === "imobiliária") return "{nome}, um dos pontos que estamos analisando em imobiliárias é o que acontece com os contatos que chegam dos portais e outros canais depois do primeiro atendimento. Principalmente follow-up, oportunidades antigas e a consistência dos corretores no acompanhamento. Como vocês trabalham isso hoje na {empresa}?";
  if (norm === "marmoraria") return "{nome}, um dos pontos que estamos analisando em marmorarias é o que acontece com os pedidos de orçamento que não fecham de imediato. Principalmente follow-up, clientes que somem depois da cotação e oportunidades que acabam esquecidas. Como vocês trabalham isso hoje na {empresa}?";
  return "Olá {nome}, identifiquei um ponto específico na operação da {empresa} que pode estar travando o crescimento de vocês. Podemos falar 2 minutos?";
}

function getNicheT6(norm: string): string {
  if (norm === "academia") return "{nome}, uma provocação rápida: muitas academias olham bastante para novas matrículas, mas pouco para quantas oportunidades e ex-alunos já passaram pela operação e poderiam ser recuperados. Às vezes existe receita dentro da própria base antes mesmo de aumentar aquisição. Foi um dos motivos pelos quais tentei falar contigo.";
  if (norm === "alimentação") return "{nome}, uma provocação rápida: muitas operações trabalham bastante para conquistar a primeira venda, mas depois deixam a recompra praticamente nas mãos do cliente ou do marketplace. Quando existe uma estratégia para trabalhar a própria base, frequência e margem começam a mudar. Foi um dos motivos pelos quais tentei falar contigo.";
  if (norm === "clínicas") return "{nome}, uma provocação rápida: muitas clínicas investem bastante para gerar novos pacientes enquanto existe uma quantidade relevante de pessoas que já pediram informações, fizeram avaliação ou receberam orçamento e nunca foram recuperadas. Às vezes existe receita esquecida dentro da própria base. Foi um dos motivos pelos quais tentei falar contigo.";
  if (norm === "energia solar") return "{nome}, uma provocação rápida: em operações comerciais de energia solar, muitas vezes o problema não está somente em gerar novas oportunidades, mas no volume de propostas e negociações antigas que nunca receberam um follow-up estruturado. Foi um dos pontos que motivaram meu contato.";
  if (norm === "imobiliária") return "{nome}, uma provocação rápida: muitas imobiliárias continuam investindo em portais enquanto existe uma quantidade enorme de contatos antigos dentro do CRM que simplesmente deixou de ser trabalhada. Em alguns casos, o gargalo está menos na entrada e mais no acompanhamento. Foi um dos motivos do meu contato.";
  if (norm === "marmoraria") return "{nome}, uma provocação rápida: nem sempre uma marmoraria precisa simplesmente vender mais. Às vezes o ganho está em recuperar melhores orçamentos, aumentar ticket, priorizar projetos mais rentáveis e dar previsibilidade à carteira. Foi um dos motivos pelos quais tentei falar contigo.";
  return "{nome}, seguindo nossa conversa sobre a {empresa}, identifiquei mais um ponto que pode acelerar os resultados de vocês. Faz sentido marcarmos 10 minutos?";
}

const OVERRIDES_KEY = "p21_cadence_overrides";
const SCHEMA_VERSION_KEY = "p21_cadence_schema_version";
const SCHEMA_VERSION = 2; // SOC migration

export function normalizeCadence(steps: CadenceStep[]): CadenceStep[] {
  // Garante T0-T9
  const list = steps.some((s) => s.attempt === 0) ? [...steps] : [{ ...createDefaultSteps("__default__")[0] }, ...steps];
  // Remove etapas além de T9 se existirem
  const limited = list.slice(0, 10);
  return limited.map((s, i) => ({ ...s, attempt: i }));
}

export function getCadenceForNiche(niche?: string): CadenceStep[] {
  const norm = normalizeNiche(niche);
  const overrides = uload<Record<string, CadenceStep[]>>(OVERRIDES_KEY, {});
  
  // Migração SOC
  const version = uload<number>(SCHEMA_VERSION_KEY, 0);
  if (version < SCHEMA_VERSION) {
    // Executa migração idempotente
    const updatedOverrides = { ...overrides };
    Object.keys(updatedOverrides).forEach(key => {
      updatedOverrides[key] = normalizeCadence(updatedOverrides[key]);
    });
    // Se não tinha energia solar, imobiliaria, marmoraria salvas, o default ja pega o novo SOC
    usave(OVERRIDES_KEY, updatedOverrides);
    usave(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
    return normalizeCadence(updatedOverrides[norm] || createDefaultSteps(norm));
  }

  if (overrides[norm]?.length) return normalizeCadence(overrides[norm]);
  return createDefaultSteps(norm);
}

export function saveCadenceForNiche(niche: string | undefined, steps: CadenceStep[]) {
  const map = uload<Record<string, CadenceStep[]>>(OVERRIDES_KEY, {});
  map[normalizeNiche(niche)] = normalizeCadence(steps);
  usave(OVERRIDES_KEY, map);
  try { window.dispatchEvent(new CustomEvent("p21:cadence-changed")); } catch {}
}

export function resetCadenceForNiche(niche?: string) {
  const map = uload<Record<string, CadenceStep[]>>(OVERRIDES_KEY, {});
  delete map[normalizeNiche(niche)];
  usave(OVERRIDES_KEY, map);
}

export function getStepForLead(lead: Lead): CadenceStep | null {
  const stage = (lead.stage || "").trim();
  const cadence = getCadenceForNiche(lead.niche);
  if (/^novo lead$/i.test(stage)) return cadence.find((s) => s.attempt === 0) || cadence[0] || null;
  const m = stage.match(/tentativa\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return cadence.find((s) => s.attempt === n) || null;
  }
  if (/^tentativas concluidas$/i.test(stage.replace(/[íú]/g, 'u'))) return null;
  return null;
}

export function executionMoment(lead: Lead): string {
  const t = new Date(lead.stageChangedAt).getTime();
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `Atrasado ${days}d`;
}
