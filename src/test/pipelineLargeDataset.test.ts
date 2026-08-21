import { describe, expect, it } from "vitest";
import { leadMatchesQuery } from "@/modules/pipeline/services/leadSearch";
import type { Lead } from "@/shared/services/store";

function makeLead(index: number): Lead {
  return {
    id: `lead-${index}`,
    company: `Empresa Café ${index}`,
    contact: `Contato ${index}`,
    phone: `(11) 9${String(index).padStart(8, "0")}`,
    niche: index % 2 === 0 ? "Restaurante" : "Varejo",
    city: index % 3 === 0 ? "São Paulo" : "Campinas",
    notes: index === 42 ? "marcador-exclusivo" : `codigo-${String(index).padStart(4, "0")}`,
    stage: index % 2 === 0 ? "Novo Lead" : "Tentativa 1",
    createdAt: "2026-01-01T00:00:00.000Z",
    stageChangedAt: "2026-01-01T00:00:00.000Z",
    icpStars: 2,
    runsAds: false,
    attachments: [],
    callNotes: [],
    interactions: [],
  } as Lead;
}

describe("pipeline performance with the production-sized dataset", () => {
  it("searches and groups 4,740 leads without changing the source collection", () => {
    const leads = Array.from({ length: 4_740 }, (_, index) => makeLead(index));
    const originalFirst = leads[0];

    const matches = leads.filter((lead) =>
      lead.niche === "Restaurante" &&
      lead.city === "São Paulo" &&
      leadMatchesQuery(lead, "cafe marcador-exclusivo")
    );

    const byStage = new Map<string, Lead[]>();
    for (const lead of leads) {
      const current = byStage.get(lead.stage) ?? [];
      current.push(lead);
      byStage.set(lead.stage, current);
    }

    expect(matches.map((lead) => lead.id)).toEqual(["lead-42"]);
    expect(byStage.get("Novo Lead")).toHaveLength(2_370);
    expect(byStage.get("Tentativa 1")).toHaveLength(2_370);
    expect(leads).toHaveLength(4_740);
    expect(leads[0]).toBe(originalFirst);

    // A segunda busca reutiliza o índice textual memoizado.
    expect(leads.filter((lead) => leadMatchesQuery(lead, "marcador-exclusivo"))).toHaveLength(1);
  });
});
