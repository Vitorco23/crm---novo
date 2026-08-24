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