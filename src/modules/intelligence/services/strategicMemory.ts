// ============================================================
// Memória Estratégica do Diretor Comercial IA (Sprint 3 — Phoenix)
// ------------------------------------------------------------
// Camada 100% determinística construída sobre os dados já existentes
// (sessões de pomodoro, reuniões, eventos de movimentação, leads,
// financeiro e histórico de pareceres do próprio Diretor).
//
// Regras:
// - Nenhuma nova tabela, tela, módulo ou Edge Function.
// - Nenhuma conclusão inventada: quando não há amostra suficiente,
//   o campo é marcado como `suficiente: false` e a IA é instruída a
//   responder "Ainda não há dados suficientes para concluir".
// - Serve como contexto de entrada para o parecer executivo; a IA
//   interpreta esses números, nunca os cria.
// ============================================================

import { uload } from "@/shared/services/userStorage";
import {
  getLeads, getMeetings, getMovementEvents, getSessions,
  type Lead, type PomodoroSession,
} from "@/shared/services/store";
import { getTransactions, monthKey } from "@/modules/financeiro/services/finance";

// Chave do histórico de pareceres (lida diretamente para evitar ciclo de import).
const DIRETOR_HISTORY_KEY = "p21_diretor_ia_history";

// ---------------- Tipos ----------------

export interface VolumeJanela {
  ligacoes: number;
  conexoes: number;
  decisores: number;
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  propostas: number;
  vendas: number;
  minutosProdutivos: number;
  pomodoros: number;
  diasComAtividade: number;
}

export interface Conversoes {
  ligacaoConexaoPct: number | null;
  conexaoDecisorPct: number | null;
  decisorReuniaoPct: number | null;
  reuniaoVendaPct: number | null;
}

export interface ComparativoJanela {
  janela: string;
  atual: VolumeJanela;
  anterior: VolumeJanela;
  variacaoPct: Record<keyof VolumeJanela, number | null>;
  conversoesAtual: Conversoes;
  conversoesAnterior: Conversoes;
  conversoesDeltaPp: Record<keyof Conversoes, number | null>;
  suficiente: boolean;
}

export interface PadraoRanking {
  label: string;
  ligacoes: number;
  conexoes: number;
  reunioes: number;
  vendas?: number;
  taxaConexaoPct: number | null;
  taxaReuniaoPct: number | null;
  ticketMedio?: number | null;
  diasMediosAteGanho?: number | null;
}

export interface MemoriaDecisao {
  data: string;
  gargalo: string;
  decisao: string;
  plano: string[];
  resultado: {
    diasDecorridos: number;
    ligacoesAntes: number;
    ligacoesDepois: number;
    reunioesAntes: number;
    reunioesDepois: number;
    vendasAntes: number;
    vendasDepois: number;
    veredito: "melhorou" | "piorou" | "estavel" | "sem_dados";
  };
}

export interface MemoriaEstrategica {
  geradoEm: string;
  amostra: {
    diasComDados: number;
    totalSessoes: number;
    totalLigacoes30d: number;
    suficienteParaTendencia: boolean;
    suficienteParaNichos: boolean;
    suficienteParaScripts: boolean;
    aviso: string | null;
  };
  hojeVsOntem: ComparativoJanela;
  semanaVsAnterior: ComparativoJanela;
  mesVsAnterior: ComparativoJanela;
  produtividade: {
    melhorFaixaHoraria: { faixa: string; ligacoes: number; taxaReuniaoPct: number | null } | null;
    piorFaixaHoraria: { faixa: string; ligacoes: number; taxaReuniaoPct: number | null } | null;
    melhorDiaSemana: { dia: string; mediaLigacoes: number } | null;
    piorDiaSemana: { dia: string; mediaLigacoes: number } | null;
    mediaMinutosPorDiaAtivo: number;
    mediaLigacoesPorPomodoro: number | null;
    quedaPosAlmocoPct: number | null;
    suficiente: boolean;
  };
  nichos: { ranking: PadraoRanking[]; suficiente: boolean };
  scripts: { ranking: PadraoRanking[]; suficiente: boolean };
  agenda: {
    reunioesPorDiaSemana: Record<string, number>;
    faixaHorariaReunioesMaisComum: string | null;
    suficiente: boolean;
  };
  financeiro: {
    receitaMes: number;
    receitaMesAnterior: number;
    variacaoReceitaPct: number | null;
    custoOperacionalPorReuniao: number | null;   // ligações necessárias por reunião (7d)
    custoOperacionalPorVenda: number | null;     // ligações necessárias por venda (30d)
    variacaoCustoPorReuniaoPct: number | null;
    valorPipelineAberto: number;
  };
  decisoesAnteriores: MemoriaDecisao[];
  padroesPersistentes: string[];
  melhorou: string[];
  piorou: string[];
  estavel: string[];
}

// ---------------- Helpers ----------------

const DAY = 86400000;
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

function inRange(iso: string | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= start.getTime() && t <= end.getTime();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function varPct(atual: number, anterior: number): number | null {
  if (anterior > 0) return round1(((atual - anterior) / anterior) * 100);
  return atual > 0 ? null : 0;
}

function pct(part: number, total: number): number | null {
  return total > 0 ? round1((part / total) * 100) : null;
}

function deltaPp(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : round1(a - b);
}

// ---------------- Agregação por janela ----------------

function volume(start: Date, end: Date): VolumeJanela {
  const sessions = getSessions().filter((s) => inRange(s.startTime, start, end));
  const meetings = getMeetings().filter((m) => inRange(`${m.date}T${m.time || "00:00"}`, start, end));
  const movements = getMovementEvents().filter((e) => inRange(e.timestamp, start, end));

  const sum = (fn: (s: PomodoroSession) => number) => sessions.reduce((a, s) => a + (fn(s) || 0), 0);
  const dias = new Set(sessions.map((s) => new Date(s.startTime).toDateString())).size;

  return {
    ligacoes: sum((s) => s.calls),
    conexoes: sum((s) => s.connections),
    decisores: sum((s) => s.decisionMakers),
    reunioesMarcadas: Math.max(meetings.length, sum((s) => s.meetings)),
    reunioesRealizadas: movements.filter((m) => /reuni[aã]o realizada/i.test(m.toStage)).length,
    propostas: movements.filter((m) => /proposta/i.test(m.toStage)).length,
    vendas: movements.filter((m) => /ganho/i.test(m.toStage)).length,
    minutosProdutivos: sum((s) => s.durationMinutes),
    pomodoros: sessions.length,
    diasComAtividade: dias,
  };
}

function conversoes(v: VolumeJanela): Conversoes {
  return {
    ligacaoConexaoPct: pct(v.conexoes, v.ligacoes),
    conexaoDecisorPct: pct(v.decisores, v.conexoes),
    decisorReuniaoPct: pct(v.reunioesMarcadas, v.decisores),
    reuniaoVendaPct: pct(v.vendas, v.reunioesMarcadas),
  };
}

function comparativo(
  janela: string,
  aStart: Date, aEnd: Date,
  bStart: Date, bEnd: Date,
  minLigacoes: number,
): ComparativoJanela {
  const atual = volume(aStart, aEnd);
  const anterior = volume(bStart, bEnd);
  const cAtual = conversoes(atual);
  const cAnterior = conversoes(anterior);

  const variacaoPct = {} as Record<keyof VolumeJanela, number | null>;
  (Object.keys(atual) as Array<keyof VolumeJanela>).forEach((k) => {
    variacaoPct[k] = varPct(atual[k], anterior[k]);
  });

  const conversoesDeltaPp = {} as Record<keyof Conversoes, number | null>;
  (Object.keys(cAtual) as Array<keyof Conversoes>).forEach((k) => {
    conversoesDeltaPp[k] = deltaPp(cAtual[k], cAnterior[k]);
  });

  return {
    janela,
    atual,
    anterior,
    variacaoPct,
    conversoesAtual: cAtual,
    conversoesAnterior: cAnterior,
    conversoesDeltaPp,
    suficiente: atual.ligacoes + anterior.ligacoes >= minLigacoes,
  };
}

// ---------------- Padrões comportamentais ----------------

function produtividade(sessions30: PomodoroSession[]) {
  const faixas = new Map<string, { calls: number; meetings: number }>();
  const porDia = new Map<number, { calls: number; dias: Set<string> }>();
  let manha = 0, tarde = 0;

  sessions30.forEach((s) => {
    const d = new Date(s.startTime);
    const h = d.getHours();
    const faixa = `${String(h).padStart(2, "0")}h-${String(h + 1).padStart(2, "0")}h`;
    const f = faixas.get(faixa) ?? { calls: 0, meetings: 0 };
    f.calls += s.calls || 0;
    f.meetings += s.meetings || 0;
    faixas.set(faixa, f);

    const wd = d.getDay();
    const p = porDia.get(wd) ?? { calls: 0, dias: new Set<string>() };
    p.calls += s.calls || 0;
    p.dias.add(d.toDateString());
    porDia.set(wd, p);

    if (h < 12) manha += s.calls || 0;
    else tarde += s.calls || 0;
  });

  const faixasArr = Array.from(faixas.entries())
    .filter(([, v]) => v.calls >= 15)
    .map(([faixa, v]) => ({ faixa, ligacoes: v.calls, taxaReuniaoPct: pct(v.meetings, v.calls) }))
    .sort((a, b) => (b.taxaReuniaoPct ?? -1) - (a.taxaReuniaoPct ?? -1));

  const diasArr = Array.from(porDia.entries())
    .map(([wd, v]) => ({ dia: WEEKDAYS[wd], mediaLigacoes: round1(v.calls / Math.max(1, v.dias.size)) }))
    .sort((a, b) => b.mediaLigacoes - a.mediaLigacoes);

  const totalCalls = sessions30.reduce((a, s) => a + (s.calls || 0), 0);
  const totalMin = sessions30.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  const diasAtivos = new Set(sessions30.map((s) => new Date(s.startTime).toDateString())).size;

  return {
    melhorFaixaHoraria: faixasArr[0] ?? null,
    piorFaixaHoraria: faixasArr.length > 1 ? faixasArr[faixasArr.length - 1] : null,
    melhorDiaSemana: diasArr[0] ?? null,
    piorDiaSemana: diasArr.length > 1 ? diasArr[diasArr.length - 1] : null,
    mediaMinutosPorDiaAtivo: diasAtivos ? Math.round(totalMin / diasAtivos) : 0,
    mediaLigacoesPorPomodoro: sessions30.length ? round1(totalCalls / sessions30.length) : null,
    quedaPosAlmocoPct: manha > 0 ? round1(((tarde - manha) / manha) * 100) : null,
    suficiente: totalCalls >= 50 && diasAtivos >= 3,
  };
}

// ---------------- Nichos e scripts ----------------

function rankingPorChave(
  sessions: PomodoroSession[],
  chave: (s: PomodoroSession) => string | undefined,
  leadsGanhos: Lead[],
  chaveLead?: (l: Lead) => string | undefined,
  minLigacoes = 20,
): { ranking: PadraoRanking[]; suficiente: boolean } {
  const map = new Map<string, PadraoRanking & { _ganhos: number[]; _dias: number[] }>();
  const ensure = (label: string) => {
    const key = label.toUpperCase();
    if (!map.has(key)) {
      map.set(key, {
        label, ligacoes: 0, conexoes: 0, reunioes: 0, vendas: 0,
        taxaConexaoPct: null, taxaReuniaoPct: null,
        _ganhos: [], _dias: [],
      });
    }
    return map.get(key)!;
  };

  sessions.forEach((s) => {
    const k = (chave(s) || "").trim();
    if (!k) return;
    const b = ensure(k);
    b.ligacoes += s.calls || 0;
    b.conexoes += s.connections || 0;
    b.reunioes += s.meetings || 0;
  });

  if (chaveLead) {
    leadsGanhos.forEach((l) => {
      const k = (chaveLead(l) || "").trim();
      if (!k) return;
      const b = ensure(k);
      b.vendas = (b.vendas || 0) + 1;
      if (l.contractValue) b._ganhos.push(l.contractValue);
      const dias = Math.max(
        0,
        Math.round((new Date(l.stageChangedAt).getTime() - new Date(l.createdAt).getTime()) / DAY),
      );
      if (isFinite(dias)) b._dias.push(dias);
    });
  }

  const ranking = Array.from(map.values())
    .filter((b) => b.ligacoes >= minLigacoes || (b.vendas || 0) > 0)
    .map((b) => ({
      label: b.label,
      ligacoes: b.ligacoes,
      conexoes: b.conexoes,
      reunioes: b.reunioes,
      vendas: b.vendas,
      taxaConexaoPct: pct(b.conexoes, b.ligacoes),
      taxaReuniaoPct: pct(b.reunioes, b.ligacoes),
      ticketMedio: b._ganhos.length
        ? Math.round(b._ganhos.reduce((a, v) => a + v, 0) / b._ganhos.length)
        : null,
      diasMediosAteGanho: b._dias.length
        ? Math.round(b._dias.reduce((a, v) => a + v, 0) / b._dias.length)
        : null,
    }))
    .sort((a, b) => (b.taxaReuniaoPct ?? -1) - (a.taxaReuniaoPct ?? -1))
    .slice(0, 6);

  return { ranking, suficiente: ranking.length >= 2 };
}

// ---------------- Memória de decisões ----------------

interface ParecerLike {
  date: string;
  analise?: { gargalo?: { titulo?: string }; decisaoDoDia?: string; planoDeAtaque?: string[] };
  painel?: { prioridades?: string[]; dica?: string };
}

function memoriaDecisoes(): { decisoes: MemoriaDecisao[]; padroes: string[] } {
  const history = (uload<ParecerLike[]>(DIRETOR_HISTORY_KEY, []) || []).slice(0, 8);
  const hoje = startOfDay(new Date()).getTime();

  const decisoes: MemoriaDecisao[] = history
    .filter((p) => p.analise || p.painel)
    .slice(0, 4)
    .map((p) => {
      const base = new Date(`${p.date}T12:00:00`);
      const diasDecorridos = Math.max(0, Math.round((hoje - startOfDay(base).getTime()) / DAY));
      const antes = volume(startOfDay(shift(base, -7)), endOfDay(shift(base, -1)));
      const depois = volume(startOfDay(base), endOfDay(new Date()));

      let veredito: MemoriaDecisao["resultado"]["veredito"] = "sem_dados";
      if (diasDecorridos >= 1 && antes.ligacoes + depois.ligacoes >= 30) {
        const antesRate = pct(antes.reunioesMarcadas, antes.ligacoes) ?? 0;
        const depoisRate = pct(depois.reunioesMarcadas, depois.ligacoes) ?? 0;
        const score = (depoisRate - antesRate) + (varPct(depois.vendas, antes.vendas) ?? 0) / 10;
        veredito = score > 1 ? "melhorou" : score < -1 ? "piorou" : "estavel";
      }

      return {
        data: p.date,
        gargalo: p.analise?.gargalo?.titulo || "—",
        decisao: p.analise?.decisaoDoDia || p.painel?.dica || "—",
        plano: (p.analise?.planoDeAtaque || p.painel?.prioridades || []).slice(0, 3),
        resultado: {
          diasDecorridos,
          ligacoesAntes: antes.ligacoes,
          ligacoesDepois: depois.ligacoes,
          reunioesAntes: antes.reunioesMarcadas,
          reunioesDepois: depois.reunioesMarcadas,
          vendasAntes: antes.vendas,
          vendasDepois: depois.vendas,
          veredito,
        },
      };
    });

  // Padrões persistentes: mesmo gargalo repetido em pareceres consecutivos.
  const padroes: string[] = [];
  const gargalos = history
    .map((p) => (p.analise?.gargalo?.titulo || "").trim())
    .filter(Boolean);
  if (gargalos.length >= 2) {
    let streak = 1;
    for (let i = 1; i < gargalos.length; i++) {
      if (gargalos[i].toLowerCase() === gargalos[0].toLowerCase()) streak++;
      else break;
    }
    if (streak >= 2) {
      padroes.push(
        `O gargalo "${gargalos[0]}" aparece há ${streak} pareceres consecutivos — recomendação anterior não produziu efeito ou não foi executada.`,
      );
    }
  }

  return { decisoes, padroes };
}

// ---------------- Construção final ----------------

export function buildStrategicMemory(): MemoriaEstrategica {
  const now = new Date();

  const hojeVsOntem = comparativo(
    "hoje vs. ontem",
    startOfDay(now), now,
    startOfDay(shift(now, -1)), endOfDay(shift(now, -1)),
    10,
  );
  const semanaVsAnterior = comparativo(
    "últimos 7 dias vs. 7 dias anteriores",
    startOfDay(shift(now, -6)), endOfDay(now),
    startOfDay(shift(now, -13)), endOfDay(shift(now, -7)),
    60,
  );
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fimMesAnterior = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const mesVsAnterior = comparativo(
    "mês atual vs. mês anterior",
    startOfDay(inicioMes), endOfDay(now),
    startOfDay(inicioMesAnterior), fimMesAnterior,
    150,
  );

  const s30Start = startOfDay(shift(now, -29));
  const sessions30 = getSessions().filter((s) => inRange(s.startTime, s30Start, endOfDay(now)));
  const leads = getLeads();
  const leadsGanhos = leads.filter(
    (l) => /ganho/i.test(l.stage) && inRange(l.stageChangedAt, startOfDay(shift(now, -89)), endOfDay(now)),
  );

  const nichos = rankingPorChave(sessions30, (s) => s.niche, leadsGanhos, (l) => l.niche, 20);
  const scripts = rankingPorChave(sessions30, (s) => s.scriptUsed, [], undefined, 30);

  // Agenda
  const meetings60 = getMeetings().filter((m) =>
    inRange(`${m.date}T${m.time || "00:00"}`, startOfDay(shift(now, -59)), endOfDay(now)),
  );
  const reunioesPorDiaSemana: Record<string, number> = {};
  const horaCount = new Map<string, number>();
  meetings60.forEach((m) => {
    const d = new Date(`${m.date}T${m.time || "00:00"}`);
    if (isNaN(d.getTime())) return;
    const wd = WEEKDAYS[d.getDay()];
    reunioesPorDiaSemana[wd] = (reunioesPorDiaSemana[wd] || 0) + 1;
    const faixa = `${String(d.getHours()).padStart(2, "0")}h`;
    horaCount.set(faixa, (horaCount.get(faixa) || 0) + 1);
  });
  const faixaTop = Array.from(horaCount.entries()).sort((a, b) => b[1] - a[1])[0];

  // Financeiro / custo operacional
  const tx = getTransactions();
  const mkNow = monthKey(now.toISOString().slice(0, 10));
  const mkPrev = monthKey(inicioMesAnterior.toISOString().slice(0, 10));
  const receita = (mk: string) =>
    tx.filter((t) => t.kind === "revenue" && monthKey(t.date) === mk).reduce((a, t) => a + t.amount, 0);
  const receitaMes = receita(mkNow);
  const receitaMesAnterior = receita(mkPrev);

  const cur7 = semanaVsAnterior.atual;
  const prev7 = semanaVsAnterior.anterior;
  const custoAtual = cur7.reunioesMarcadas > 0 ? round1(cur7.ligacoes / cur7.reunioesMarcadas) : null;
  const custoAnterior = prev7.reunioesMarcadas > 0 ? round1(prev7.ligacoes / prev7.reunioesMarcadas) : null;
  const v30 = volume(s30Start, endOfDay(now));
  const custoPorVenda = v30.vendas > 0 ? round1(v30.ligacoes / v30.vendas) : null;

  const CLOSED = /ganho|perdido/i;
  const valorPipelineAberto = leads
    .filter((l) => !CLOSED.test(l.stage))
    .reduce((a, l) => a + (l.contractValue || 0), 0);

  const { decisoes, padroes } = memoriaDecisoes();

  // Leitura determinística: o que melhorou / piorou / permaneceu igual (7d vs 7d).
  const melhorou: string[] = [];
  const piorou: string[] = [];
  const estavel: string[] = [];
  const rotulos: Array<[keyof VolumeJanela, string]> = [
    ["ligacoes", "Ligações"],
    ["conexoes", "Conexões"],
    ["decisores", "Decisores"],
    ["reunioesMarcadas", "Reuniões marcadas"],
    ["vendas", "Vendas"],
  ];
  rotulos.forEach(([k, label]) => {
    const v = semanaVsAnterior.variacaoPct[k];
    if (v === null) return;
    const txt = `${label}: ${cur7[k]} vs ${prev7[k]} (${v > 0 ? "+" : ""}${v}%)`;
    if (v >= 10) melhorou.push(txt);
    else if (v <= -10) piorou.push(txt);
    else estavel.push(txt);
  });
  (Object.keys(semanaVsAnterior.conversoesDeltaPp) as Array<keyof Conversoes>).forEach((k) => {
    const d = semanaVsAnterior.conversoesDeltaPp[k];
    if (d === null) return;
    const nome = {
      ligacaoConexaoPct: "Ligação→Conexão",
      conexaoDecisorPct: "Conexão→Decisor",
      decisorReuniaoPct: "Decisor→Reunião",
      reuniaoVendaPct: "Reunião→Venda",
    }[k];
    const txt = `${nome}: ${semanaVsAnterior.conversoesAtual[k]}% (${d > 0 ? "+" : ""}${d} p.p.)`;
    if (d >= 2) melhorou.push(txt);
    else if (d <= -2) piorou.push(txt);
    else estavel.push(txt);
  });

  const totalSessoes = sessions30.length;
  const diasComDados = new Set(sessions30.map((s) => new Date(s.startTime).toDateString())).size;
  const suficienteParaTendencia = diasComDados >= 5 && v30.ligacoes >= 60;

  return {
    geradoEm: new Date().toISOString(),
    amostra: {
      diasComDados,
      totalSessoes,
      totalLigacoes30d: v30.ligacoes,
      suficienteParaTendencia,
      suficienteParaNichos: nichos.suficiente,
      suficienteParaScripts: scripts.suficiente,
      aviso: suficienteParaTendencia
        ? null
        : "Amostra histórica insuficiente: não conclua tendências ou padrões; declare explicitamente que ainda não há dados suficientes.",
    },
    hojeVsOntem,
    semanaVsAnterior,
    mesVsAnterior,
    produtividade: produtividade(sessions30),
    nichos,
    scripts,
    agenda: {
      reunioesPorDiaSemana,
      faixaHorariaReunioesMaisComum: faixaTop ? faixaTop[0] : null,
      suficiente: meetings60.length >= 5,
    },
    financeiro: {
      receitaMes,
      receitaMesAnterior,
      variacaoReceitaPct: varPct(receitaMes, receitaMesAnterior),
      custoOperacionalPorReuniao: custoAtual,
      custoOperacionalPorVenda: custoPorVenda,
      variacaoCustoPorReuniaoPct:
        custoAtual !== null && custoAnterior !== null ? varPct(custoAtual, custoAnterior) : null,
      valorPipelineAberto,
    },
    decisoesAnteriores: decisoes,
    padroesPersistentes: padroes,
    melhorou,
    piorou,
    estavel,
  };
}

/**
 * Digest textual da memória de decisões — enviado no campo `previousAnalysis`
 * para que a IA avalie se as próprias recomendações produziram efeito.
 */
export function buildDecisionMemoryDigest(mem: MemoriaEstrategica): string {
  if (!mem.decisoesAnteriores.length) return "";
  const linhas = mem.decisoesAnteriores.map((d) => {
    const r = d.resultado;
    const efeito =
      r.veredito === "sem_dados"
        ? "sem dados suficientes para avaliar o efeito"
        : `resultado ${r.veredito} (ligações ${r.ligacoesAntes}→${r.ligacoesDepois}, reuniões ${r.reunioesAntes}→${r.reunioesDepois}, vendas ${r.vendasAntes}→${r.vendasDepois})`;
    return `- ${d.data} | gargalo: ${d.gargalo} | decisão: ${d.decisao} | plano: ${d.plano.join(" / ") || "—"} | ${efeito}`;
  });
  const extra = mem.padroesPersistentes.length
    ? `\nPadrões persistentes: ${mem.padroesPersistentes.join(" ")}`
    : "";
  return `HISTÓRICO DE DECISÕES DO DIRETOR (avalie se produziram efeito; não repita a mesma recomendação sem novo contexto):\n${linhas.join("\n")}${extra}`;
}
