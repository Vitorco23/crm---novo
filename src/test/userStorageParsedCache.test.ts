import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Auditoria 30/08: adiciona um cache do valor já parseado para chaves
// "heavy" (ex.: p21_leads) — telas como o Dashboard chamavam uload()
// dezenas de vezes no mesmo carregamento, cada chamada reparseando do zero
// um JSON com milhares de leads. Estes testes provam que (1) o cache
// realmente evita reparse repetido, (2) escrita invalida/atualiza o cache
// na hora — nunca serve dado velho, e (3) troca de usuário nunca vaza dado
// de um usuário para o cache lido pelo outro.

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: (row: any) => mocks.upsert(row),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: (k: string, v: any) => mocks.deleteEq(k, v),
        })),
      })),
    })),
  },
}));

vi.mock("@/shared/services/idbCache", () => ({
  idbGet: vi.fn(async () => null),
  idbSet: vi.fn(async () => undefined),
  idbDelete: vi.fn(async () => undefined),
}));

import { setCurrentUser, uload, usave } from "@/shared/services/userStorage";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.deleteEq.mockReset();
  mocks.deleteEq.mockResolvedValue({ error: null });
  setCurrentUser(null);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("uload/usave — cache de valor parseado para chaves heavy", () => {
  it("uload repetido para uma chave heavy (p21_leads) não reparseia o JSON de novo", () => {
    setCurrentUser("user-a", "a@example.test");
    const leads = [{ id: "L1" }, { id: "L2" }];
    usave("p21_leads", leads);

    const parseSpy = vi.spyOn(JSON, "parse");
    const first = uload<typeof leads>("p21_leads", []);
    const second = uload<typeof leads>("p21_leads", []);

    expect(first).toEqual(leads);
    expect(second).toEqual(leads);
    expect(parseSpy).not.toHaveBeenCalled(); // já veio do cache, sem JSON.parse
    parseSpy.mockRestore();
  });

  it("usave atualiza o cache na hora — próximo uload nunca serve dado velho", () => {
    setCurrentUser("user-a", "a@example.test");
    usave("p21_leads", [{ id: "L1" }]);
    expect(uload<{ id: string }[]>("p21_leads", [])).toEqual([{ id: "L1" }]);

    usave("p21_leads", [{ id: "L1" }, { id: "L2" }]);
    expect(uload<{ id: string }[]>("p21_leads", [])).toEqual([{ id: "L1" }, { id: "L2" }]);
  });

  it("troca de usuário nunca vaza o cache de um usuário para o outro", () => {
    setCurrentUser("user-a", "a@example.test");
    usave("p21_leads", [{ id: "lead-do-a" }]);

    setCurrentUser("user-b", "b@example.test");
    expect(uload<{ id: string }[]>("p21_leads", [])).toEqual([]); // sem dado próprio ainda

    usave("p21_leads", [{ id: "lead-do-b" }]);
    expect(uload<{ id: string }[]>("p21_leads", [])).toEqual([{ id: "lead-do-b" }]);

    // volta pra "a" na mesma sessão (sem logout): o cache dele, escrito no
    // início do teste, continua isolado sob a chave própria — não foi
    // sobrescrito pelo que "b" salvou.
    setCurrentUser("user-a", "a@example.test");
    expect(uload<{ id: string }[]>("p21_leads", [])).toEqual([{ id: "lead-do-a" }]);
  });

  it("chave leve (não-heavy) continua funcionando normalmente, sem depender do cache novo", () => {
    setCurrentUser("user-a", "a@example.test");
    usave("p21_goals_settings", { target: 5 });
    expect(uload("p21_goals_settings", {})).toEqual({ target: 5 });

    usave("p21_goals_settings", { target: 9 });
    expect(uload("p21_goals_settings", {})).toEqual({ target: 9 });
  });
});
