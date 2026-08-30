import { describe, it, expect } from "vitest";
import { buildWaLink, leadWhatsappPhone } from "./whatsappLink";

describe("buildWaLink", () => {
  it("normaliza o telefone (mesma regra do resto do sistema) e monta a URL wa.me", () => {
    expect(buildWaLink("(75) 98834-1777")).toBe("https://wa.me/5575988341777");
  });

  it("com mensagem, adiciona ?text= codificado", () => {
    const url = buildWaLink("75988341777", "Oi, tudo bem?");
    expect(url).toBe("https://wa.me/5575988341777?text=Oi%2C%20tudo%20bem%3F");
  });

  it("sem telefone válido, devolve null", () => {
    expect(buildWaLink("")).toBeNull();
    expect(buildWaLink(undefined)).toBeNull();
    expect(buildWaLink(null)).toBeNull();
  });

  it("mensagem vazia/só espaço não vira ?text= vazio na URL", () => {
    expect(buildWaLink("75988341777", "   ")).toBe("https://wa.me/5575988341777");
  });
});

describe("leadWhatsappPhone", () => {
  it("prefere o campo whatsapp dedicado sobre o phone geral", () => {
    expect(leadWhatsappPhone({ whatsapp: "111", phone: "222" })).toBe("111");
  });

  it("cai para phone quando não há whatsapp", () => {
    expect(leadWhatsappPhone({ phone: "222" })).toBe("222");
  });
});
