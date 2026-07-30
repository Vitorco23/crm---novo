// Motor de eficiência comercial — "custo em ligações" por resultado.
// Puro: recebe volumes já filtrados pelo período do Dashboard e devolve
// quantas ligações são necessárias, em média, para 1 reunião e para 1 venda.

export interface EfficiencyRatio {
  /** ligações necessárias por 1 resultado (arredondado) — null = inconclusivo */
  callsPerResult: number | null;
  calls: number;
  results: number;
  reason?: "sem-ligacoes" | "sem-resultados" | "amostra-baixa";
}

/** Amostra mínima de ligações para o índice ser considerado confiável. */
const MIN_CALLS_SAMPLE = 10;

export function computeEfficiencyRatio(calls: number, results: number): EfficiencyRatio {
  if (calls <= 0) return { callsPerResult: null, calls, results, reason: "sem-ligacoes" };
  if (results <= 0) return { callsPerResult: null, calls, results, reason: "sem-resultados" };
  const ratio = Math.round(calls / results);
  return {
    callsPerResult: ratio,
    calls,
    results,
    reason: calls < MIN_CALLS_SAMPLE ? "amostra-baixa" : undefined,
  };
}

export function normalizeStage(stage: string): string {
  return String(stage || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Conta reuniões marcadas e vendas (Ganho) a partir de eventos de movimentação. */
export function countOutcomes(events: { toStage: string }[]) {
  let meetings = 0;
  let sales = 0;
  for (const e of events) {
    const s = normalizeStage(e.toStage);
    if (s.includes("reuniao marcada")) meetings++;
    else if (s === "ganho") sales++;
  }
  return { meetings, sales };
}
