import { describe, expect, it } from "vitest";
import type { Lead } from "@/shared/services/store";
import { importLeadsWithTag, type LeadImportFieldKey } from "./leadImport";

const mapping = {
  company: "Empresa",
  contact: "__none__",
  phone: "Telefone",
  website: "__none__",
  niche: "__none__",
  city: "Cidade",
  gmnLink: "__none__",
  instagramLink: "__none__",
  notes: "__none__",
  googleRating: "__none__",
  googleReviews: "__none__",
  icpStars: "__none__",
} satisfies Record<LeadImportFieldKey, string>;

function existingLead(): Lead {
  return {
    id: "existing-1",
    company: "Clínica Alfa",
    phone: "(11) 99999-0000",
    city: "São Paulo",
    icpStars: 2,
    runsAds: false,
    tags: ["GMN"],
    stage: "Tentativa 4",
    createdAt: "2026-08-01T00:00:00.000Z",
    stageChangedAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("importLeadsWithTag", () => {
  it.each(["LUPUS", "INBOUND"])("creates a visible cold-call lead with the %s tag", (tag) => {
    const result = importLeadsWithTag([], [{ Empresa: `Lead ${tag}`, Telefone: "11988887777", Cidade: "Campinas" }], mapping, tag, "Novo Lead");

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({ stage: "Novo Lead", tags: [tag] });
  });

  it("updates a duplicate, preserves its stage and puts LUPUS first", () => {
    const result = importLeadsWithTag(
      [existingLead()],
      [{ Empresa: "Clínica Alfa Atualizada", Telefone: "11 99999-0000", Cidade: "São Paulo" }],
      mapping,
      "LUPUS",
      "Novo Lead",
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.leads[0].stage).toBe("Tentativa 4");
    expect(result.leads[0].tags).toEqual(["LUPUS", "GMN"]);
    expect(result.leads[0].company).toBe("Clínica Alfa Atualizada");
  });
});

describe("importLeadsWithTag — Informações Adicionais → notes (correção de duplicação)", () => {
  const mappingWithNotes = { ...mapping, notes: "Informações Adicionais" };

  it("TESTE 1: texto de Informações Adicionais aparece uma única vez ao criar o lead", () => {
    const texto = "Telefone e operação confirmados em ficha pública atual; selecionada para disparos após auditoria.";
    const result = importLeadsWithTag(
      [],
      [{ Empresa: "Lead Novo", Telefone: "11988887777", Cidade: "Campinas", "Informações Adicionais": texto }],
      mappingWithNotes,
      "LUPUS",
      "Novo Lead",
    );
    expect(result.leads[0].notes).toBe(texto);
  });

  it("TESTE 2: Informações Adicionais vazia mantém notes vazia/inalterada", () => {
    const result = importLeadsWithTag(
      [],
      [{ Empresa: "Lead Sem Nota", Telefone: "11988887777", Cidade: "Campinas", "Informações Adicionais": "" }],
      mappingWithNotes,
      "LUPUS",
      "Novo Lead",
    );
    expect(result.leads[0].notes).toBe("");

    const existing = existingLead();
    existing.notes = "Nota manual já existente";
    const updateResult = importLeadsWithTag(
      [existing],
      [{ Empresa: existing.company, Telefone: "11 99999-0000", Cidade: "São Paulo", "Informações Adicionais": "" }],
      mappingWithNotes,
      "LUPUS",
      "Novo Lead",
    );
    expect(updateResult.leads[0].notes).toBe("Nota manual já existente");
  });

  it("TESTE 3: nota manual existente e Informações Adicionais distintas convivem, sem duplicar a mesma string", () => {
    const existing = existingLead();
    existing.notes = "Nota manual já existente";
    const texto = "Telefone e operação confirmados em ficha pública atual.";

    const firstImport = importLeadsWithTag(
      [existing],
      [{ Empresa: existing.company, Telefone: "11 99999-0000", Cidade: "São Paulo", "Informações Adicionais": texto }],
      mappingWithNotes,
      "LUPUS",
      "Novo Lead",
    );
    expect(firstImport.leads[0].notes).toBe(`Nota manual já existente\n${texto}`);

    const reImport = importLeadsWithTag(
      firstImport.leads,
      [{ Empresa: existing.company, Telefone: "11 99999-0000", Cidade: "São Paulo", "Informações Adicionais": texto }],
      mappingWithNotes,
      "LUPUS",
      "Novo Lead",
    );
    expect(reImport.leads[0].notes).toBe(`Nota manual já existente\n${texto}`);
  });

  it("TESTE 4: header de Informações Adicionais com variação de acentuação/caixa mapeia uma única vez", () => {
    const texto = "Contato validado na base pública.";
    const mappingAccentVariant = { ...mapping, notes: "informacoes adicionais" };
    const result = importLeadsWithTag(
      [],
      [{ Empresa: "Lead Variante", Telefone: "11988887777", Cidade: "Campinas", "informacoes adicionais": texto }],
      mappingAccentVariant,
      "LUPUS",
      "Novo Lead",
    );
    expect(result.leads[0].notes).toBe(texto);
  });
});