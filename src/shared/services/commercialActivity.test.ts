import { describe, it, expect, beforeEach, vi } from "vitest";

// Storage em memória — evita tocar Supabase/localStorage reais.
const mem: Record<string, unknown> = {};
vi.mock("@/shared/services/userStorage", () => ({
  uload: <T,>(k: string, fallback: T): T => (mem[k] as T) ?? fallback,
  usave: <T,>(k: string, v: T) => { mem[k] = v; },
}));

let meetingsMem: any[] = [];
vi.mock("@/shared/services/store", () => ({
  getMeetings: () => meetingsMem,
}));

import { recordActivity } from "./activityLedger";
import { computeCommercialActivity, findCorrelatedCallfaceInteraction } from "./commercialActivity";

const DAY_FROM = new Date("2026-08-15T00:00:00.000Z");
const DAY_TO = new Date("2026-08-15T23:59:59.999Z");
const at = (min: number) => new Date(Date.UTC(2026, 7, 15, 10, min)).toISOString();

const totals = () => computeCommercialActivity(DAY_FROM, DAY_TO);

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  meetingsMem = [];
});

describe("commercialActivity — ligações", () => {
  it("CallFace confirmado conta como ligação", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    expect(totals().calls).toBe(1);
  });

  it("outcomes não ambíguos do canal Ligação contam como ligação", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_resposta", at: at(0) });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "caixa_postal", at: at(1) });
    expect(totals().calls).toBe(2);
  });

  it("contato_invalido sem attemptPerformed não conta", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "contato_invalido", attemptPerformed: false, at: at(0) });
    expect(totals().calls).toBe(0);
  });

  it("contato_invalido com attemptPerformed:true conta", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "contato_invalido", attemptPerformed: true, at: at(0) });
    expect(totals().calls).toBe(1);
  });

  it("outro sem attemptPerformed não conta; com attemptPerformed conta", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "outro", attemptPerformed: false, at: at(0) });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "outro", attemptPerformed: true, at: at(1) });
    expect(totals().calls).toBe(1);
  });

  it("dedupe: conclusão de cadência com relatedExternalKey apontando para um CallFace no período = 1 ligação", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(5), relatedExternalKey: "inbound:r1" });
    expect(totals().calls).toBe(1);
  });

  it("sem relatedExternalKey (nenhuma correlação encontrada) = 2 ligações reais, mesmo perto no tempo", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(5) });
    expect(totals().calls).toBe(2);
  });

  it("leads diferentes nunca deduplicam entre si", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(1) });
    expect(totals().calls).toBe(2);
  });

  it("canal WhatsApp/Instagram/E-mail nunca conta como ligação", () => {
    recordActivity({ leadId: "L1", channel: "message", source: "cadence_attempt", outcome: "sem_resposta", at: at(0) });
    recordActivity({ leadId: "L2", channel: "email", source: "cadence_attempt", outcome: "agendou", at: at(1) });
    expect(totals().calls).toBe(0);
  });
});

describe("commercialActivity — conexões e decisores", () => {
  it("sem_interesse/pediu_retorno/agendou contam como conexão; sem_resposta/caixa_postal não", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(0) });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "pediu_retorno", at: at(1) });
    recordActivity({ leadId: "L3", channel: "call", source: "cadence_attempt", outcome: "agendou", at: at(2) });
    recordActivity({ leadId: "L4", channel: "call", source: "cadence_attempt", outcome: "sem_resposta", at: at(3) });
    recordActivity({ leadId: "L5", channel: "call", source: "cadence_attempt", outcome: "caixa_postal", at: at(4) });
    const t = totals();
    expect(t.calls).toBe(5);
    expect(t.connections).toBe(3);
  });

  it("CallFace sozinho não é contado como conexão (regra pendente de decisão)", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    expect(totals().connections).toBe(0);
  });

  it("outro só conta como conexão com connected:true explícito", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "outro", attemptPerformed: true, connected: false, at: at(0) });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "outro", attemptPerformed: true, connected: true, at: at(1) });
    expect(totals().connections).toBe(1);
  });

  it("talkedTo:decisor alimenta decisionMakers; intermediario/nao_identificado não", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "agendou", talkedTo: "decisor", at: at(0) });
    recordActivity({ leadId: "L2", channel: "call", source: "cadence_attempt", outcome: "pediu_retorno", talkedTo: "intermediario", at: at(1) });
    recordActivity({ leadId: "L3", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", talkedTo: "nao_identificado", at: at(2) });
    expect(totals().decisionMakers).toBe(1);
  });
});

describe("findCorrelatedCallfaceInteraction — correlação explícita CallFace ↔ cadência", () => {
  it("1) CallFace + cadastro manual do mesmo lead em até 10min, vinculados → 1 ligação", () => {
    const leadInteractions = [{ id: "inbound:r1", date: at(0) }];
    const key = findCorrelatedCallfaceInteraction(leadInteractions, at(8));
    expect(key).toBe("inbound:r1");

    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(8), relatedExternalKey: key });
    expect(totals().calls).toBe(1);
  });

  it("2) duas ligações CallFace reais e próximas do mesmo lead, cada uma vinculada à sua própria tentativa → 2 ligações", () => {
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(15), externalKey: "inbound:r2" });

    const interactionsAfterBoth = [
      { id: "inbound:r1", date: at(0) },
      { id: "inbound:r2", date: at(15) },
    ];
    const key1 = findCorrelatedCallfaceInteraction(interactionsAfterBoth, at(4));
    expect(key1).toBe("inbound:r1");
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(4), relatedExternalKey: key1 });

    const key2 = findCorrelatedCallfaceInteraction(interactionsAfterBoth, at(18));
    expect(key2).toBe("inbound:r2"); // r1 já está vinculada — não pode ser reaproveitada
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "pediu_retorno", at: at(18), relatedExternalKey: key2 });

    expect(totals().calls).toBe(2);
  });

  it("3) cadence_attempt sem nenhuma Interaction CallFace por perto → nenhuma correlação, 1 ligação", () => {
    const key = findCorrelatedCallfaceInteraction([], at(0));
    expect(key).toBeUndefined();
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_resposta", at: at(0), relatedExternalKey: key });
    expect(totals().calls).toBe(1);
  });

  it("4) CallFace e cadence_attempt separados por mais de 10min → sem correlação, 2 ligações", () => {
    const leadInteractions = [{ id: "inbound:r1", date: at(0) }];
    const key = findCorrelatedCallfaceInteraction(leadInteractions, at(11));
    expect(key).toBeUndefined();

    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(11), relatedExternalKey: key });
    expect(totals().calls).toBe(2);
  });

  it("5) Interaction de outro lead dentro da janela não é considerada — o array já vem escopado ao lead do dialog", () => {
    // O chamador real sempre passa `lead.interactions`, que só pode conter
    // interações daquele lead. Simulamos isso passando só as interações de
    // L1 mesmo havendo uma ligação CallFace de L2 na mesma janela de tempo.
    recordActivity({ leadId: "L2", channel: "call", source: "callface", at: at(0), externalKey: "inbound:other-lead" });
    const l1OwnInteractions: { id: string; date: string }[] = []; // L1 não tem essa interação
    const key = findCorrelatedCallfaceInteraction(l1OwnInteractions, at(2));
    expect(key).toBeUndefined();
  });

  it("6) uma Interaction CallFace já vinculada a outra tentativa não pode ser reutilizada", () => {
    const leadInteractions = [{ id: "inbound:r1", date: at(0) }];
    recordActivity({ leadId: "L1", channel: "call", source: "callface", at: at(0), externalKey: "inbound:r1" });

    const first = findCorrelatedCallfaceInteraction(leadInteractions, at(3));
    expect(first).toBe("inbound:r1");
    recordActivity({ leadId: "L1", channel: "call", source: "cadence_attempt", outcome: "sem_interesse", at: at(3), relatedExternalKey: first });

    // Uma segunda tentativa, ainda dentro da janela, não pode reaproveitar a mesma interação.
    const second = findCorrelatedCallfaceInteraction(leadInteractions, at(6));
    expect(second).toBeUndefined();
  });

  it("ignora interações que não são CallFace (id sem prefixo inbound:)", () => {
    const leadInteractions = [{ id: "manual-note-1", date: at(0) }];
    const key = findCorrelatedCallfaceInteraction(leadInteractions, at(2));
    expect(key).toBeUndefined();
  });
});

describe("commercialActivity — reuniões: agendada hoje vs. acontece hoje", () => {
  it("createdAt hoje / date futura = agendada hoje, não acontece hoje", () => {
    meetingsMem = [{ id: "m1", leadId: "L1", createdAt: at(0), date: "2026-09-01", time: "10:00" }];
    const t = totals();
    expect(t.meetingsScheduled).toBe(1);
    expect(t.meetingsOccurring).toBe(0);
  });

  it("createdAt antigo / date hoje = acontece hoje, não agendada hoje", () => {
    meetingsMem = [{ id: "m1", leadId: "L1", createdAt: "2026-08-01T10:00:00.000Z", date: "2026-08-15", time: "14:00" }];
    const t = totals();
    expect(t.meetingsScheduled).toBe(0);
    expect(t.meetingsOccurring).toBe(1);
  });

  it("reagendamento (mesmo registro, date mudou) preserva createdAt — não vira 'agendada hoje' de novo", () => {
    meetingsMem = [{ id: "m1", leadId: "L1", createdAt: "2026-08-01T10:00:00.000Z", date: "2026-08-15", time: "09:00" }];
    const t = totals();
    expect(t.meetingsScheduled).toBe(0);
    expect(t.meetingsOccurring).toBe(1);
  });
});
