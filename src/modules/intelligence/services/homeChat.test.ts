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

const emptyContext = {
  generatedAt: "", profile: null,
  period: { date: "2026-08-15", time: "09:00", startOfDay: "", endOfDay: "", timezone: "America/Sao_Paulo" },
  goals: { calls: 0, connections: 0, decisionMakers: 0, meetings: 0 },
  activity: { calls: 0, connections: 0, decisionMakers: 0, meetingsScheduled: 0, meetingsOccurring: 0 },
  progress: {
    calls: { goal: 0, done: 0, remaining: 0, progressPct: 0 },
    connections: { goal: 0, done: 0, remaining: 0, progressPct: 0 },
    decisionMakers: { goal: 0, done: 0, remaining: 0, progressPct: 0 },
    meetings: { goal: 0, done: 0, remaining: 0, progressPct: 0 },
  },
  meetings: { today: [], next: null, minutesToNext: null, past: [], upcoming: [] },
  followUps: { overdueCount: 0, todayCount: 0, items: [] },
  tasks: { overdueCount: 0, todayCount: 0, items: [] },
  pipeline: { openTotal: 0, byStage: {}, hotCount: 0, proposalCount: 0, staleCount: 0, openValue: 0 },
  priorities: [],
  productivity: { minutesToday: 0, sessionsToday: 0 },
};

vi.mock("@/shared/services/commercialContext", () => ({
  getCommercialContext: vi.fn(() => emptyContext),
}));

import {
  computeGreeting, computeDailySuggestions, getOrCreateDailyState,
  UNIVERSAL_SUGGESTIONS, appendMessage, getMessages, clearConversation,
  sendMessage, todayKey,
} from "./homeChat";
import { getCommercialContext } from "@/shared/services/commercialContext";

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  invoke.mockReset();
  vi.mocked(getCommercialContext).mockReset().mockReturnValue(emptyContext as any);
});

describe("computeGreeting", () => {
  it("2) com perfil, usa o nome resolvido e o horário", () => {
    const morning = new Date(2026, 7, 15, 8, 0, 0);
    expect(computeGreeting("Vitor", morning)).toBe("Bom dia, Vitor. Por onde começamos?");
  });

  it("3) sem perfil, cai para saudação neutra sem quebrar", () => {
    const afternoon = new Date(2026, 7, 15, 15, 0, 0);
    expect(computeGreeting(undefined, afternoon)).toBe("Boa tarde. Por onde começamos?");
  });

  it("noite (>=18h) usa 'Boa noite'", () => {
    const night = new Date(2026, 7, 15, 20, 0, 0);
    expect(computeGreeting("Ana", night)).toBe("Boa noite, Ana. Por onde começamos?");
  });
});

describe("computeDailySuggestions", () => {
  it("4) contexto vazio devolve só sugestões universais", () => {
    const out = computeDailySuggestions(emptyContext as any);
    expect(out).toEqual(UNIVERSAL_SUGGESTIONS.slice(0, 5));
  });

  it("5) follow-up vencido aparece como sugestão contextual, primeiro na lista", () => {
    const ctx = { ...emptyContext, followUps: { ...emptyContext.followUps, overdueCount: 2 } };
    const out = computeDailySuggestions(ctx as any);
    expect(out[0]).toBe("Quais follow-ups devo resolver primeiro?");
  });

  it("6) reunião hoje aparece como sugestão contextual", () => {
    const ctx = { ...emptyContext, meetings: { ...emptyContext.meetings, today: [{ id: "m1" }] } };
    const out = computeDailySuggestions(ctx as any) as string[];
    expect(out).toContain("Como devo me preparar para minha próxima reunião?");
  });

  it("nunca ultrapassa 5 sugestões mesmo com todos os gatilhos ativos", () => {
    const ctx = {
      ...emptyContext,
      followUps: { ...emptyContext.followUps, overdueCount: 1 },
      meetings: { ...emptyContext.meetings, today: [{ id: "m1" }] },
      pipeline: { ...emptyContext.pipeline, staleCount: 1 },
      priorities: [{ leadId: "L1" }],
      tasks: { ...emptyContext.tasks, overdueCount: 1 },
    };
    const out = computeDailySuggestions(ctx as any);
    expect(out.length).toBe(5);
  });
});

describe("getOrCreateDailyState — 7) sugestões estáveis no dia, saudação acompanha o horário (ajuste 31/08)", () => {
  it("mesmo dia, horário avança: a PALAVRA da saudação muda, mas sugestões continuam as do primeiro cálculo do dia", () => {
    const morning = new Date(2026, 7, 15, 9, 0, 0);
    const first = getOrCreateDailyState(emptyContext as any, "Vitor", morning);
    expect(first.greeting).toBe("Bom dia, Vitor. Por onde começamos?");

    const night = new Date(2026, 7, 15, 20, 0, 0);
    const changedCtx = { ...emptyContext, followUps: { ...emptyContext.followUps, overdueCount: 5 } };
    const second = getOrCreateDailyState(changedCtx as any, "Vitor", night);

    expect(second.greeting).toBe("Boa noite, Vitor. Por onde começamos?");
    expect(second.date).toBe(first.date);
    expect(second.suggestions).toEqual(first.suggestions); // contexto mudou, mas sugestões não recalculam no mesmo dia
  });

  it("chamar de novo na mesma hora devolve o mesmo conteúdo (nada mudou pra regravar)", () => {
    const now = new Date(2026, 7, 15, 9, 0, 0);
    const first = getOrCreateDailyState(emptyContext as any, "Vitor", now);
    const again = getOrCreateDailyState(emptyContext as any, "Vitor", now);
    expect(again).toEqual(first);
  });

  it("dia seguinte recalcula com o novo contexto", () => {
    const day1 = new Date(2026, 7, 15, 9, 0, 0);
    getOrCreateDailyState(emptyContext as any, "Vitor", day1);

    const day2 = new Date(2026, 7, 16, 9, 0, 0);
    const changedCtx = { ...emptyContext, followUps: { ...emptyContext.followUps, overdueCount: 3 } };
    const next = getOrCreateDailyState(changedCtx as any, "Vitor", day2);

    expect(next.date).toBe(todayKey(day2));
    expect(next.suggestions[0]).toBe("Quais follow-ups devo resolver primeiro?");
  });
});

describe("persistência da conversa", () => {
  it("10) mensagem manual: appendMessage grava e getMessages devolve na ordem", () => {
    appendMessage("user", "Olá");
    appendMessage("assistant", "Oi, tudo bem?");
    const msgs = getMessages();
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("15) refresh simulado — reler getMessages() depois não perde nada já salvo", () => {
    appendMessage("user", "pergunta 1");
    const before = getMessages();
    const after = getMessages(); // nova leitura, simula reload
    expect(after).toEqual(before);
  });

  it("clearConversation esvazia sem quebrar", () => {
    appendMessage("user", "x");
    clearConversation();
    expect(getMessages()).toEqual([]);
  });
});

describe("sendMessage", () => {
  it("9) clique em sugestão / mensagem vazia não é enviada", async () => {
    const res = await sendMessage("   ");
    expect(res.ok).toBe(false);
    expect(getMessages().length).toBe(0);
  });

  it("11) loading→sucesso: persiste a mensagem do usuário e a resposta da IA", async () => {
    invoke.mockResolvedValue({ data: { content: "Você fez 10 ligações hoje.", model: "openai/gpt-5.4-mini" }, error: null });
    const res = await sendMessage("Como estou?", { name: "Vitor" });
    expect(res.ok).toBe(true);
    expect(res.message?.content).toBe("Você fez 10 ligações hoje.");
    const msgs = getMessages();
    expect(msgs.length).toBe(2);
    expect(msgs[0]).toMatchObject({ role: "user", content: "Como estou?" });
    expect(msgs[1]).toMatchObject({ role: "assistant", content: "Você fez 10 ligações hoje." });
  });

  it("12) erro da IA: mensagem do usuário fica salva, resposta de erro NÃO é persistida", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Limite de requisições atingido." } });
    const res = await sendMessage("Quem devo ligar?");
    expect(res.ok).toBe(false);
    expect(res.errorMessage).toBe("Limite de requisições atingido.");
    const msgs = getMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe("user");
  });

  it("20) [branch migracao-gemini] chama exclusivamente a função home-chat-gemini via supabase.functions.invoke", async () => {
    invoke.mockResolvedValue({ data: { content: "ok" }, error: null });
    await sendMessage("teste");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("home-chat-gemini", expect.objectContaining({
      body: expect.objectContaining({ message: "teste" }),
    }));
  });

  it("contexto é recalculado a cada envio (mesmo com sugestões fixas)", async () => {
    invoke.mockResolvedValue({ data: { content: "ok" }, error: null });
    await sendMessage("primeira");
    await sendMessage("segunda");
    expect(getCommercialContext).toHaveBeenCalledTimes(2);
  });
});

describe("sendMessage — resposta estruturada (redesign narrativa + cards + pergunta)", () => {
  const structured = {
    texto_narrativo: "Hoje você tem 2 follow-ups atrasados que valem atenção.",
    itens: [
      { nome: "Anma Odontologia", acao: "Ligar agora", metricas: [{ label: "Dias sem contato", valor: "17" }] },
    ],
    pergunta_fechamento: "Quer que eu prepare esse contato agora?",
  };

  it("persiste data.structured na mensagem do assistente quando presente", async () => {
    invoke.mockResolvedValue({
      data: { content: "Hoje você tem 2 follow-ups atrasados que valem atenção.", structured, model: "openai/gpt-5.4-mini" },
      error: null,
    });
    const res = await sendMessage("Quais follow-ups devo resolver primeiro?");
    expect(res.ok).toBe(true);
    expect(res.message?.structured).toEqual(structured);
    const msgs = getMessages();
    expect(msgs[1].structured).toEqual(structured);
  });

  it("mensagens antigas/legado sem data.structured continuam funcionando (structured fica ausente)", async () => {
    invoke.mockResolvedValue({ data: { content: "Você fez 10 ligações hoje." }, error: null });
    const res = await sendMessage("Como estou?");
    expect(res.ok).toBe(true);
    expect(res.message?.structured).toBeUndefined();
    expect(res.message?.content).toBe("Você fez 10 ligações hoje.");
  });

  it("data.structured malformado (não-objeto) é ignorado, mensagem ainda é salva pelo content", async () => {
    invoke.mockResolvedValue({ data: { content: "ok", structured: "não é objeto" }, error: null });
    const res = await sendMessage("teste");
    expect(res.ok).toBe(true);
    expect(res.message?.structured).toBeUndefined();
  });
});
