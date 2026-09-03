import { describe, it, expect } from "vitest";
import { findMentionedLead, buildLeadContextBlock } from "./leadLookup";
import type { Lead } from "./store";

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    company: "Okume Sushi",
    contact: "Ana",
    phone: "5511999990000",
    niche: "Restaurantes",
    city: "São Paulo",
    icpStars: 3,
    runsAds: false,
    stage: "Tentativa 2",
    createdAt: "2026-08-01T10:00:00",
    stageChangedAt: "2026-08-01T10:00:00",
    interactions: [],
    callNotes: [],
    ...over,
  } as Lead;
}

describe("findMentionedLead — busca determinística por nome/empresa (auditoria 03/09)", () => {
  it("encontra o lead mesmo sem score/autoDiagnosis/top-15 (TESTE 1)", () => {
    const okume = makeLead();
    const outro = makeLead({ id: "lead-2", company: "Restaurante Sabor" });
    const found = findMentionedLead("e o Okume Sushi?", [okume, outro]);
    expect(found?.id).toBe("lead-1");
  });

  it("ignora acento/caixa", () => {
    const okume = makeLead({ company: "Okumé Sushi" });
    const found = findMentionedLead("EM QUAL ETAPA ESTA O okume sushi", [okume]);
    expect(found?.id).toBe("lead-1");
  });

  it("prefere o nome de empresa mais específico quando há mais de um match", () => {
    const curto = makeLead({ id: "lead-a", company: "Sushi" });
    const longo = makeLead({ id: "lead-b", company: "Okume Sushi Delivery" });
    const found = findMentionedLead("como está o Okume Sushi Delivery?", [curto, longo]);
    expect(found?.id).toBe("lead-b");
  });

  it("lead inexistente não é inventado (TESTE 4)", () => {
    const okume = makeLead();
    const found = findMentionedLead("e a Pizzaria Nonna Maria?", [okume]);
    expect(found).toBeNull();
  });

  it("mensagem vazia não quebra e não encontra nada", () => {
    expect(findMentionedLead("", [makeLead()])).toBeNull();
  });
});

describe("buildLeadContextBlock — contexto do lead específico", () => {
  it("traz campos comerciais e última interação real (TESTE 2)", () => {
    const lead = makeLead({
      notes: "Decisor é o sócio.",
      interactions: [
        { id: "i1", type: "Ligação", date: "2026-08-20T10:00:00", title: "Primeira ligação", summary: "Apresentou proposta inicial." },
        { id: "i2", type: "WhatsApp", date: "2026-08-25T10:00:00", title: "Follow-up", summary: "Confirmou interesse, pediu prazo." },
      ],
    });
    const ctx = buildLeadContextBlock(lead);
    expect(ctx.encontrado).toBe(true);
    expect(ctx.empresa).toBe("Okume Sushi");
    expect(ctx.etapa).toBe("Tentativa 2");
    expect(ctx.ultimaInteracaoEm).toBe("2026-08-25T10:00:00");
    expect(ctx.interacoesRecentes[0].resumo).toBe("Confirmou interesse, pediu prazo.");
  });

  it("limita a 10 interações mais recentes, mesclando interactions e callNotes", () => {
    const interactions = Array.from({ length: 8 }, (_, i) => ({
      id: `i${i}`,
      type: "WhatsApp" as const,
      date: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00`,
      title: "msg",
      summary: `interacao ${i}`,
    }));
    const callNotes = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      text: `ligacao ${i}`,
      createdAt: `2026-08-${String(i + 20).padStart(2, "0")}T10:00:00`,
    }));
    const lead = makeLead({ interactions, callNotes });
    const ctx = buildLeadContextBlock(lead);
    expect(ctx.interacoesRecentes).toHaveLength(10);
    // as mais recentes são as callNotes (datas maiores) — a mais recente primeiro
    expect(ctx.interacoesRecentes[0].resumo).toBe("ligacao 4");
  });

  it("sem autoDiagnosis, o campo simplesmente fica ausente (nunca inventa)", () => {
    const ctx = buildLeadContextBlock(makeLead());
    expect(ctx.autoDiagnostico).toBeUndefined();
  });
});
