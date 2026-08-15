import { describe, it, expect, beforeEach, vi } from "vitest";

// Storage em memória — evita tocar Supabase/localStorage reais.
const mem: Record<string, unknown> = {};
vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fallback: T): T => (mem[k] as T) ?? fallback,
  usave: <T,>(k: string, v: T) => { mem[k] = v; },
}));

import { recordActivity, summarizeActivity } from "./activityLedger";

const DAY_FROM = new Date("2026-08-15T00:00:00.000Z");
const DAY_TO = new Date("2026-08-15T23:59:59.999Z");
const at = (min: number) => new Date(Date.UTC(2026, 7, 15, 10, min)).toISOString();

const sum = () => summarizeActivity(DAY_FROM, DAY_TO);

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

describe("activityLedger — regra canônica de ligação", () => {
  it("A) inbound + movimentação + tentativa concluída no mesmo lead = 1 ligação confirmada", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "movement", at: at(1) });
    recordActivity({ leadId: "L1", channel: "call", source: "attempt", at: at(2) });
    const s = sum();
    expect(s.byChannel.call).toBe(1);
    expect(s.confirmedByChannel.call).toBe(1);
    expect(s.estimatedByChannel.call).toBe(0);
  });

  it("B) dois inbound IDs diferentes para o mesmo lead em menos de 60 min = 2 ligações", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(20), externalKey: "inbound:r2" });
    const s = sum();
    expect(s.byChannel.call).toBe(2);
    expect(s.confirmedByChannel.call).toBe(2);
  });

  it("C) tentativa manual sem inbound = 1 ligação estimada", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "attempt", at: at(0) });
    const s = sum();
    expect(s.byChannel.call).toBe(1);
    expect(s.confirmedByChannel.call).toBe(0);
    expect(s.estimatedByChannel.call).toBe(1);
  });

  it("D) movimentação isolada = 0 ligações", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "movement", at: at(0) });
    const s = sum();
    expect(s.byChannel.call).toBe(0);
    expect(s.total).toBe(0);
  });

  it("E) reprocessamento do mesmo inbound ID = 1 ligação", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(5), externalKey: "inbound:r1" });
    const s = sum();
    expect(s.byChannel.call).toBe(1);
  });

  it("F) WhatsApp estimado não aparece como disparo confirmado", () => {
    recordActivity({ leadId: "L1", channel: "message", source: "movement", at: at(0) });
    const s = sum();
    expect(s.byChannel.message).toBe(1);
    expect(s.confirmedByChannel.message).toBe(0);
    expect(s.estimatedByChannel.message).toBe(1);
  });

  it("mensagem registrada manualmente é confirmada e reuniões são independentes", () => {
    recordActivity({ leadId: "L1", channel: "message", source: "interaction", at: at(0) });
    recordActivity({ leadId: "L1", channel: "meeting", source: "meeting", at: at(3) });
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(4), externalKey: "inbound:r9" });
    const s = sum();
    expect(s.confirmedByChannel.message).toBe(1);
    expect(s.byChannel.meeting).toBe(1);
    expect(s.byChannel.call).toBe(1);
  });
});
