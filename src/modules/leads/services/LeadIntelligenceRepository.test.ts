// Testes do domínio Lead Intelligence (Projeto Phoenix, Fase 3B).
// Cobrem: isolamento entre leads, consistência do mesmo lead em telas
// diferentes (Dashboard/Pipeline/Timeline) e cache por assinatura do lead.

import { describe, it, expect, beforeEach } from "vitest";
import { LeadIntelligenceRepository as LI } from "@/modules/leads/services/LeadIntelligenceRepository";
import type { Lead, AutoDiagnosis } from "@/shared/services/store";

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    company: "Empresa 1",
    contact: "Contato 1",
    phone: "11999990000",
    niche: "Clinicas",
    city: "Sao Paulo",
    gmnLink: "",
    instagramLink: "",
    icpStars: 2,
    runsAds: false,
    stage: "Novo Lead",
    createdAt: "2026-07-01T10:00:00",
    stageChangedAt: "2026-07-20T10:00:00",
    notes: "",
    attachments: [],
    interactions: [],
    callNotes: [],
    ...over,
  } as Lead;
}

const diag = (over: Partial<AutoDiagnosis> = {}): AutoDiagnosis => ({
  temperature: "quente",
  probability: 80,
  summary: "Decisor engajado",
  next_action: "Enviar proposta hoje",
  attention: "",
  updated_memory: "",
  generatedAt: "2026-07-28T10:00:00",
  inputHash: "h1",
  ...over,
});

beforeEach(() => LI.invalidate());

describe("isolamento entre leads", () => {
  it("dois leads abertos em sequencia nao misturam diagnostico, temperatura nem ultima interacao", () => {
    const quente = makeLead({
      id: "A",
      company: "Alfa",
      autoDiagnosis: diag(),
      interactions: [{ id: "i1", type: "WhatsApp", date: "2026-07-27T09:00:00", title: "Msg Alfa", summary: "Alfa respondeu" } as never],
    });
    const frio = makeLead({
      id: "B",
      company: "Beta",
      autoDiagnosis: diag({ temperature: "frio", next_action: "Aguardar retorno", summary: "Sem contato" }),
      interactions: [{ id: "i2", type: "Ligação", date: "2026-07-26T09:00:00", title: "Call Beta", summary: "Beta nao atendeu" } as never],
    });

    const a = LI.view(quente);
    const b = LI.view(frio);

    expect(a.temperature.key).toBe("quente");
    expect(b.temperature.key).toBe("frio");
    expect(a.nextAction).toBe("Enviar proposta hoje");
    expect(b.nextAction).toBe("Aguardar retorno");
    expect(a.lastInteraction?.text).toContain("Alfa");
    expect(b.lastInteraction?.text).toContain("Beta");
    expect(a.diagnosis?.summary).not.toBe(b.diagnosis?.summary);
    expect(a.leadId).toBe("A");
    expect(b.leadId).toBe("B");

    // reabrir o primeiro lead depois do segundo devolve exatamente o dado dele
    const aDeNovo = LI.view(quente);
    expect(aDeNovo.temperature.key).toBe("quente");
    expect(aDeNovo.lastInteraction?.text).toContain("Alfa");
  });
});

describe("mesmo lead em telas diferentes", () => {
  it("Dashboard, Pipeline e Timeline leem os mesmos dados sem recalcular", () => {
    const lead = makeLead({ id: "C", autoDiagnosis: diag() });
    const dashboard = LI.view(lead);
    const pipeline = LI.view(lead);
    const timeline = LI.view(lead);

    // mesma referencia de objeto => consulta unica, sem duplicacao de trabalho
    expect(pipeline).toBe(dashboard);
    expect(timeline).toBe(dashboard);
    expect(pipeline.temperature).toEqual(dashboard.temperature);
    expect(timeline.nextAction).toBe(dashboard.nextAction);
  });

  it("cache invalida quando o proprio lead muda", () => {
    const lead = makeLead({ id: "D", autoDiagnosis: diag({ temperature: "frio", next_action: "Tentar de novo" }) });
    const antes = LI.view(lead);
    expect(antes.temperature.key).toBe("frio");

    const depois = LI.view({
      ...lead,
      autoDiagnosis: diag({ generatedAt: "2026-07-29T10:00:00", next_action: "Enviar proposta hoje" }),
    });
    expect(depois).not.toBe(antes);
    expect(depois.temperature.key).toBe("quente");
    expect(depois.nextAction).toBe("Enviar proposta hoje");
  });

  it("invalidate(leadId) limpa apenas o lead informado", () => {
    const a = makeLead({ id: "E" });
    const b = makeLead({ id: "F" });
    const a1 = LI.view(a);
    const b1 = LI.view(b);
    LI.invalidate("E");
    expect(LI.view(a)).not.toBe(a1);
    expect(LI.view(b)).toBe(b1);
  });
});

describe("trilha e badges por lead", () => {
  it("reunioes de um lead nao aparecem na trilha de outro", () => {
    const comReuniao = makeLead({ id: "G" });
    const semReuniao = makeLead({ id: "H" });
    const trailG = LI.view(comReuniao, [{ id: "m1", date: "2026-07-30", time: "10:00", title: "Reunião Alfa" }]).trail;
    const trailH = LI.view(semReuniao).trail;

    expect(trailG.some((t) => t.kind === "meeting")).toBe(true);
    expect(trailH.some((t) => t.kind === "meeting")).toBe(false);
  });
});
