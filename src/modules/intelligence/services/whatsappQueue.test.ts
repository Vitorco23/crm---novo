import { describe, it, expect, beforeEach, vi } from "vitest";

const mem: Record<string, unknown> = {};
vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fallback: T): T => (mem[k] as T) ?? fallback,
  usave: <T,>(k: string, v: T) => { mem[k] = v; },
}));

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

let mockLeads: any[] = [];
let mockReminders: any[] = [];
let mockLedger: any[] = [];

vi.mock("@/shared/services/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/services/store")>();
  return {
    ...actual,
    getLeads: () => mockLeads,
    getPipelineForStage: (stage: string) =>
      /tentativa|novo lead/i.test(stage) ? "cold_call" : "oportunidades",
  };
});

vi.mock("@/modules/agenda/services/reminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/agenda/services/reminders")>();
  return { ...actual, getReminders: () => mockReminders };
});

vi.mock("@/shared/services/activityLedger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/services/activityLedger")>();
  return { ...actual, getActivityLedger: () => mockLedger };
});

import {
  DAILY_LIMIT, LOCK_HOUR,
  shouldGenerateNewQueue, buildQueueCandidates, generateAndLockQueue,
  markQueueItemContacted, usedCount, getQueueState,
  type WhatsAppQueueState,
} from "./whatsappQueue";

function makeLead(over: Partial<any> = {}): any {
  return {
    id: "L1",
    company: "Empresa Teste",
    contact: "Maria",
    phone: "75988341777",
    niche: "Clínicas",
    icpStars: 0,
    runsAds: false,
    stage: "Tentativa 2",
    stageChangedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    interactions: [],
    callNotes: [],
    ...over,
  };
}

// 18h30 de um dia fixo, horário de Brasília (UTC-3 sem horário de verão).
const AFTER_WINDOW = new Date("2026-08-30T21:30:00Z");
const BEFORE_WINDOW = new Date("2026-08-30T15:00:00Z"); // ~12h em Brasília

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  invoke.mockReset();
  mockLeads = [];
  mockReminders = [];
  mockLedger = [];
});

describe("shouldGenerateNewQueue — gatilho client-side da janela (sem cron)", () => {
  it("antes das 18h, nunca gera (mesmo sem estado nenhum)", () => {
    expect(shouldGenerateNewQueue(null, BEFORE_WINDOW)).toBe(false);
  });

  it("depois das 18h, sem estado nenhum, gera", () => {
    expect(shouldGenerateNewQueue(null, AFTER_WINDOW)).toBe(true);
  });

  it("já travado hoje — mesmo depois das 18h de novo, NÃO gera de novo (nunca recalcula no mesmo dia)", () => {
    const state: WhatsAppQueueState = {
      date: "2026-08-30", status: "locked", generatedAt: AFTER_WINDOW.toISOString(), limit: DAILY_LIMIT, items: [],
    };
    expect(shouldGenerateNewQueue(state, new Date("2026-08-30T23:00:00Z"))).toBe(false);
  });

  it("lista travada ONTEM, ainda antes da janela de hoje — mantém a de ontem, não gera ainda", () => {
    const yesterday: WhatsAppQueueState = {
      date: "2026-08-29", status: "locked", generatedAt: "2026-08-29T21:30:00Z", limit: DAILY_LIMIT, items: [],
    };
    expect(shouldGenerateNewQueue(yesterday, BEFORE_WINDOW)).toBe(false);
  });

  it("lista travada ONTEM, já passou da janela de hoje — gera a nova, substituindo a antiga", () => {
    const yesterday: WhatsAppQueueState = {
      date: "2026-08-29", status: "locked", generatedAt: "2026-08-29T21:30:00Z", limit: DAILY_LIMIT, items: [],
    };
    expect(shouldGenerateNewQueue(yesterday, AFTER_WINDOW)).toBe(true);
  });
});

describe("buildQueueCandidates — pool de candidatos (auditoria 30/08: considera autoDiagnosis + ligação de hoje, não só etapa)", () => {
  it("lead ligado hoje entra no pool mesmo em etapa de cold call", () => {
    mockLeads = [makeLead({ id: "L1", stage: "Tentativa 2" })];
    mockLedger = [{ id: "e1", at: AFTER_WINDOW.toISOString(), leadId: "L1", channel: "call", source: "callface", outcome: "sem_resposta" }];
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.map((c) => c.id)).toContain("L1");
    expect(cands[0].ligacaoHoje?.outcome).toBe("sem_resposta");
  });

  it("lead em etapa de Oportunidades entra mesmo SEM ligação hoje", () => {
    mockLeads = [makeLead({ id: "L2", stage: "Reunião Marcada" })];
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.map((c) => c.id)).toContain("L2");
  });

  it("lead de cold call sem ligação hoje e sem diagnóstico algum NÃO entra (sem sinal)", () => {
    mockLeads = [makeLead({ id: "L3", stage: "Tentativa 4" })];
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.map((c) => c.id)).not.toContain("L3");
  });

  it("leads em etapa fechada (Ganho/Perdido) nunca entram", () => {
    mockLeads = [makeLead({ id: "L4", stage: "Ganho" })];
    mockLedger = [{ id: "e2", at: AFTER_WINDOW.toISOString(), leadId: "L4", channel: "call", source: "callface", outcome: "agendou" }];
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.map((c) => c.id)).not.toContain("L4");
  });

  it("gap corrigido: autoDiagnosis (automático) sozinho já é sinal suficiente pra entrar no pool, mesmo sem CallAuditData manual", () => {
    mockLeads = [makeLead({
      id: "L5",
      stage: "Tentativa 3",
      autoDiagnosis: { summary: "Lead demonstrou interesse.", temperature: "quente", next_action: "Ligar amanhã", generatedAt: AFTER_WINDOW.toISOString() },
    })];
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.map((c) => c.id)).toContain("L5");
    expect(cands.find((c) => c.id === "L5")?.resumoLigacao).toBe("Lead demonstrou interesse.");
  });

  it("nunca devolve mais que 60 candidatos (pool com margem pra IA escolher, não os 25 finais)", () => {
    mockLeads = Array.from({ length: 100 }, (_, i) => makeLead({ id: `L${i}`, stage: "Reunião Marcada" }));
    const cands = buildQueueCandidates(AFTER_WINDOW);
    expect(cands.length).toBeLessThanOrEqual(60);
  });

  it("evento de ligação com 'at' malformado (dado legado) é ignorado, nunca derruba a tela inteira", () => {
    mockLeads = [makeLead({ id: "L1", stage: "Reunião Marcada" })];
    mockLedger = [
      { id: "e1", at: "isso-nao-e-uma-data", leadId: "L1", channel: "call", source: "callface", outcome: "sem_resposta" },
      { id: "e2", at: undefined as unknown as string, leadId: "L1", channel: "call", source: "callface", outcome: "sem_resposta" },
    ];
    expect(() => buildQueueCandidates(AFTER_WINDOW)).not.toThrow();
    const cands = buildQueueCandidates(AFTER_WINDOW);
    // ainda entra no pool (é lead de etapa Reunião Marcada), só sem sinal de "ligado hoje" vindo desses eventos quebrados.
    expect(cands.find((c) => c.id === "L1")?.ligacaoHoje).toBeNull();
  });
});

describe("generateAndLockQueue — trava a lista, mapeia mensagem e link", () => {
  it("recusa gerar antes da janela sem force", async () => {
    const res = await generateAndLockQueue(false, BEFORE_WINDOW);
    expect(res.ok).toBe(false);
    expect(getQueueState()).toBeNull();
  });

  it("com force, gera mesmo antes da janela — usado só para o teste/uso deliberado, nunca automático", async () => {
    mockLeads = [makeLead({ id: "L1", stage: "Reunião Marcada" })];
    invoke.mockResolvedValue({
      data: { items: [{ leadId: "L1", tier: 2, motivo: "Reunião marcada sem confirmação.", mensagemId: "followup_geral" }], model: "openai/gpt-5.4-mini" },
      error: null,
    });
    const res = await generateAndLockQueue(true, BEFORE_WINDOW);
    expect(res.ok).toBe(true);
    expect(res.state?.items).toHaveLength(1);
    expect(res.state?.items[0].tier).toBe(2);
    expect(res.state?.items[0].waLink).toContain("https://wa.me/5575988341777");
    expect(res.state?.items[0].mensagem.length).toBeGreaterThan(0);
  });

  it("nunca trava mais que DAILY_LIMIT itens mesmo se a IA devolver mais", async () => {
    mockLeads = Array.from({ length: 30 }, (_, i) => makeLead({ id: `L${i}`, stage: "Reunião Marcada" }));
    invoke.mockResolvedValue({
      data: { items: mockLeads.map((l) => ({ leadId: l.id, tier: 3, motivo: "x", mensagemId: null })) },
      error: null,
    });
    const res = await generateAndLockQueue(true, AFTER_WINDOW);
    expect(res.state?.items.length).toBeLessThanOrEqual(DAILY_LIMIT);
  });

  it("item com leadId que não está nos candidatos originais é descartado (nunca confia cegamente na IA)", async () => {
    mockLeads = [makeLead({ id: "L1", stage: "Reunião Marcada" })];
    invoke.mockResolvedValue({
      data: { items: [{ leadId: "L1", tier: 1, motivo: "ok", mensagemId: null }, { leadId: "LEAD-INEXISTENTE", tier: 1, motivo: "x", mensagemId: null }] },
      error: null,
    });
    const res = await generateAndLockQueue(true, AFTER_WINDOW);
    expect(res.state?.items.map((i) => i.leadId)).toEqual(["L1"]);
  });

  it("erro da IA não trava nada — estado permanece null", async () => {
    mockLeads = [makeLead({ id: "L1", stage: "Reunião Marcada" })];
    invoke.mockResolvedValue({ data: null, error: { message: "Créditos esgotados" } });
    const res = await generateAndLockQueue(true, AFTER_WINDOW);
    expect(res.ok).toBe(false);
    expect(getQueueState()).toBeNull();
  });
});

describe("markQueueItemContacted / usedCount — contador automático ao clicar (ajuste pedido)", () => {
  it("marca contactedAt na hora do clique, não exige confirmação manual separada", () => {
    const state: WhatsAppQueueState = {
      date: "2026-08-30", status: "locked", generatedAt: "2026-08-30T21:30:00Z", limit: DAILY_LIMIT,
      items: [
        { leadId: "L1", empresa: "A", tier: 1, motivo: "x", mensagemId: null, mensagem: "", waLink: "https://wa.me/1", contactedAt: null },
        { leadId: "L2", empresa: "B", tier: 2, motivo: "x", mensagemId: null, mensagem: "", waLink: "https://wa.me/2", contactedAt: null },
      ],
    };
    mem["p21_whatsapp_daily_queue"] = state;

    expect(usedCount(getQueueState())).toBe(0);
    markQueueItemContacted("L1");
    expect(usedCount(getQueueState())).toBe(1);
    markQueueItemContacted("L1"); // clicar de novo no mesmo não conta duas vezes
    expect(usedCount(getQueueState())).toBe(1);
    markQueueItemContacted("L2");
    expect(usedCount(getQueueState())).toBe(2);
  });

  it("sem estado nenhum, não quebra", () => {
    expect(() => markQueueItemContacted("L1")).not.toThrow();
  });
});
