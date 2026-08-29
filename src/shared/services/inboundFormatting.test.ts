import { describe, it, expect } from "vitest";
import { normalizePhoneBR } from "./inboundFormatting";

describe("normalizePhoneBR", () => {
  it("11 dígitos sem código do país (celular BR local) vira 55 + dígitos, sem 0 extra", () => {
    // Regressão: já produziu "55075988341777" (0 extra) em vez de "5575988341777",
    // causando lead_not_found em interações inbound (Matteline e agente de WhatsApp)
    // para todo lead salvo sem o "55" na frente.
    expect(normalizePhoneBR("75988341777")).toBe("5575988341777");
  });

  it("10 dígitos (fixo/celular antigo sem o 9) também vira 55 + dígitos, sem 0 extra", () => {
    expect(normalizePhoneBR("7532345678")).toBe("557532345678");
  });

  it("já com 55 na frente (13 dígitos) permanece inalterado", () => {
    expect(normalizePhoneBR("5575988341777")).toBe("5575988341777");
  });

  it("com formatação (parênteses, espaço, traço) remove tudo que não é dígito antes de normalizar", () => {
    expect(normalizePhoneBR("(75) 98834-1777")).toBe("5575988341777");
  });

  it("começando com 0 (DDD com trunk) prefixa 55 mantendo o 0 do input", () => {
    expect(normalizePhoneBR("075988341777")).toBe("55075988341777");
  });

  it("vazio/nulo/undefined devolve string vazia", () => {
    expect(normalizePhoneBR("")).toBe("");
    expect(normalizePhoneBR(null)).toBe("");
    expect(normalizePhoneBR(undefined)).toBe("");
  });
});
