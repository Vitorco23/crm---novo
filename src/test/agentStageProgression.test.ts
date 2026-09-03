import { describe, it, expect } from "vitest";
import { applyAgentStageProgression } from "@/shared/services/userStorage";

// Regra de negócio central do webhook do agente de prospecção (auditoria
// Regulus Energia, 03/09): mover pra "Tentativa 1" sem jamais regredir um
// lead que já avançou, e ser idempotente pra retries do webhook.

function makeLead(stage: string) {
  return { id: "lead-1", stage } as any;
}

describe("applyAgentStageProgression", () => {
  it("move 'Novo Lead' -> 'Tentativa 1' e retorna o MovementEvent", () => {
    const lead = makeLead("Novo Lead");
    const now = "2026-09-03T12:00:00.000Z";
    const movement = applyAgentStageProgression(lead, "Tentativa 1", now);

    expect(lead.stage).toBe("Tentativa 1");
    expect(lead.stageChangedAt).toBe(now);
    expect(movement).toMatchObject({
      leadId: "lead-1",
      fromStage: "Novo Lead",
      toStage: "Tentativa 1",
      timestamp: now,
      type: "movement",
    });
  });

  it("idempotente: já em 'Tentativa 1' não gera novo movimento", () => {
    const lead = makeLead("Tentativa 1");
    const movement = applyAgentStageProgression(lead, "Tentativa 1", "2026-09-03T12:00:00.000Z");

    expect(lead.stage).toBe("Tentativa 1");
    expect(movement).toBeNull();
  });

  it("nunca regride dentro do próprio Cold Call (Tentativa 3 não volta pra Tentativa 1)", () => {
    const lead = makeLead("Tentativa 3");
    const movement = applyAgentStageProgression(lead, "Tentativa 1", "2026-09-03T12:00:00.000Z");

    expect(lead.stage).toBe("Tentativa 3");
    expect(movement).toBeNull();
  });

  it("nunca regride de uma etapa comercial mais avançada (Reunião Marcada, Oportunidades)", () => {
    const lead = makeLead("Reunião Marcada");
    const movement = applyAgentStageProgression(lead, "Tentativa 1", "2026-09-03T12:00:00.000Z");

    expect(lead.stage).toBe("Reunião Marcada");
    expect(movement).toBeNull();
  });

  it("nunca regride de Onboarding", () => {
    const lead = makeLead("Implementação");
    const movement = applyAgentStageProgression(lead, "Tentativa 1", "2026-09-03T12:00:00.000Z");

    expect(lead.stage).toBe("Implementação");
    expect(movement).toBeNull();
  });

  it("status diferente de 'Tentativa 1' nunca mexe na etapa", () => {
    const lead = makeLead("Novo Lead");
    const movement = applyAgentStageProgression(lead, "Aguardando Decisor", "2026-09-03T12:00:00.000Z");

    expect(lead.stage).toBe("Novo Lead");
    expect(movement).toBeNull();
  });
});
