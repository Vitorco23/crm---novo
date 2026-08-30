import { describe, it, expect } from "vitest";
import { renderReminderTemplate } from "./reminders";
import type { Lead } from "@/shared/services/store";

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    company: "Empresa Teste",
    contact: "João da Silva",
    phone: "",
    niche: "Clínicas",
    city: "",
    icpStars: 0,
    runsAds: false,
    stage: "Novo Lead",
    createdAt: "2026-08-01T10:00:00",
    stageChangedAt: "2026-08-01T10:00:00",
    interactions: [],
    callNotes: [],
    ...over,
  } as Lead;
}

describe("renderReminderTemplate — placeholders existentes (regressão)", () => {
  it("[nome]/[empresa]/[decisor] continuam resolvendo como antes", () => {
    const lead = makeLead();
    const out = renderReminderTemplate("Olá [nome] da [empresa], falo com [decisor]?", lead);
    expect(out).toBe("Olá João da Empresa Teste, falo com João da Silva?");
  });
});

describe("renderReminderTemplate — novos placeholders de cold call (auditoria 30/08)", () => {
  it("[resumo curto] usa o CallAuditData da ligação mais recente, quando existe", () => {
    const lead = makeLead({
      callNotes: [
        {
          id: "c1",
          text: "",
          createdAt: "2026-08-20T10:00:00",
          analysis: { markdown: "", data: { resumoExecutivo: "Cliente interessado, pediu proposta." } } as any,
        },
      ],
    });
    expect(renderReminderTemplate("[resumo curto]", lead)).toBe("Cliente interessado, pediu proposta.");
  });

  it("[resumo curto] cai para autoDiagnosis.summary quando não há CallAuditData", () => {
    const lead = makeLead({
      autoDiagnosis: {
        summary: "Diagnóstico automático: lead morno.",
        temperature: "morno",
        next_action: "Ligar amanhã",
        generatedAt: "2026-08-20T10:00:00",
      } as any,
    });
    expect(renderReminderTemplate("[resumo curto]", lead)).toBe("Diagnóstico automático: lead morno.");
  });

  it("[resumo curto] sem nenhum dado disponível vira string vazia (nunca inventa)", () => {
    const lead = makeLead();
    expect(renderReminderTemplate("Resumo: [resumo curto]", lead)).toBe("Resumo: ");
  });

  it("[assunto] usa o nicho do lead", () => {
    const lead = makeLead({ niche: "Odontologia" });
    expect(renderReminderTemplate("sobre [assunto]", lead)).toBe("sobre Odontologia");
  });

  it("placeholders sem fonte confiável ([contexto breve], [sócio/pessoa]) ficam como marcador literal — vendedor completa à mão", () => {
    const lead = makeLead();
    const out = renderReminderTemplate("Falamos sobre [contexto breve]. Fala com [sócio/pessoa].", lead);
    expect(out).toBe("Falamos sobre [contexto breve]. Fala com [sócio/pessoa].");
  });
});
