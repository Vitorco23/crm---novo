import { describe, it, expect } from "vitest";
import {
  COLD_CALL_WHATSAPP_MESSAGES,
  findColdCallMessage,
  suggestColdCallMessage,
} from "./whatsappColdCallMessages";

describe("COLD_CALL_WHATSAPP_MESSAGES", () => {
  it("tem exatamente as 8 mensagens especificadas, cada uma com id e texto", () => {
    expect(COLD_CALL_WHATSAPP_MESSAGES).toHaveLength(8);
    for (const m of COLD_CALL_WHATSAPP_MESSAGES) {
      expect(m.id).toBeTruthy();
      expect(m.text.length).toBeGreaterThan(0);
    }
  });

  it("ids são únicos", () => {
    const ids = COLD_CALL_WHATSAPP_MESSAGES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findColdCallMessage", () => {
  it("acha pelo id", () => {
    expect(findColdCallMessage("nao_atendeu")?.label).toBe("Ligou e não atendeu");
  });
  it("id inexistente devolve undefined", () => {
    expect(findColdCallMessage("nao-existe")).toBeUndefined();
  });
});

describe("suggestColdCallMessage", () => {
  it("sugere 'não atendeu' para outcome sem_resposta", () => {
    expect(suggestColdCallMessage("sem_resposta")?.id).toBe("nao_atendeu");
  });
  it("sugere 'pediu pra ligar depois' para outcome pediu_retorno", () => {
    expect(suggestColdCallMessage("pediu_retorno")?.id).toBe("pediu_ligar_depois");
  });
  it("sugere 'número errado' para outcome contato_invalido", () => {
    expect(suggestColdCallMessage("contato_invalido")?.id).toBe("numero_errado");
  });
  it("outcome sem sugestão mapeada (ex.: agendou) devolve undefined", () => {
    expect(suggestColdCallMessage("agendou")).toBeUndefined();
  });
  it("outcome ausente devolve undefined", () => {
    expect(suggestColdCallMessage(undefined)).toBeUndefined();
  });
});
