import { describe, it, expect } from "vitest";
import { computeLeadTemperature } from "./coldCallMetrics";
import type { Lead } from "@/shared/services/store";

// Auditoria 30/08: computeLeadTemperature() classificava QUALQUER lead como
// "Frio" só por estar 5+ dias sem trocar de etapa — inclusive leads em
// etapas do funil de Oportunidades (ex.: "Reunião Marcada"), onde esperar
// alguns dias pela data da reunião não significa a mesma coisa que uma
// tentativa de cold call parada. Estes testes cobrem o caso relatado
// (lead "Nobre Imóveis": Reunião Marcada há 6 dias, mostrando "Frio").
function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    company: "Empresa Teste",
    contact: "",
    phone: "",
    niche: "",
    city: "",
    gmnLink: "",
    instagramLink: "",
    icpStars: 0,
    runsAds: false,
    stage: "Tentativa 3",
    createdAt: daysAgoISO(10),
    stageChangedAt: daysAgoISO(6),
    notes: "",
    attachments: [],
    interactions: [],
    callNotes: [],
    ...over,
  } as Lead;
}

describe("computeLeadTemperature — regra por pipeline (auditoria 30/08)", () => {
  it("cold_call: 6 dias parado numa tentativa continua Frio (limiar 5, comportamento original preservado)", () => {
    const lead = makeLead({ stage: "Tentativa 3", stageChangedAt: daysAgoISO(6) });
    expect(computeLeadTemperature(lead)).toBe("cold");
  });

  it("oportunidades: 6 dias em Reunião Marcada NÃO é mais Frio (limiar mais largo, ciclo natural mais longo)", () => {
    const lead = makeLead({ stage: "Reunião Marcada", stageChangedAt: daysAgoISO(6) });
    expect(computeLeadTemperature(lead)).toBe("warm");
  });

  it("oportunidades: 12 dias em Reunião Marcada aí sim vira Frio", () => {
    const lead = makeLead({ stage: "Reunião Marcada", stageChangedAt: daysAgoISO(12) });
    expect(computeLeadTemperature(lead)).toBe("cold");
  });

  it("oportunidades: 1 dia em Proposta Enviada é Quente", () => {
    const lead = makeLead({ stage: "Proposta Enviada", stageChangedAt: daysAgoISO(1) });
    expect(computeLeadTemperature(lead)).toBe("hot");
  });

  it("novo lead sem ligação e sem 1 dia ainda continua 'new'", () => {
    const lead = makeLead({ stage: "Novo Lead", stageChangedAt: daysAgoISO(0), callNotes: [] });
    expect(computeLeadTemperature(lead)).toBe("new");
  });
});
