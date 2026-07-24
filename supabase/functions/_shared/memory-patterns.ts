// Motor de Padrões da Memória Comercial.
// Agrega as memórias já registradas (commercial_memory) e devolve padrões
// estatísticos respeitando níveis de confiabilidade:
//   • < 10 casos  → padrão descartado (dados insuficientes)
//   • 10-30       → "Confiança Média"
//   • > 30        → "Confiável"
//
// Nunca inventa números: só retorna o que estiver realmente no banco.

import { createClient } from "npm:@supabase/supabase-js@2";

export type ConfidenceTier = "insuficiente" | "media" | "confiavel";

export interface NichePattern {
  niche: string;
  total: number;
  won: number;
  lost: number;
  winRate: number | null;
  avgCalls: number | null;
  avgMeetings: number | null;
  avgDurationDays: number | null;
  avgContractValue: number | null;
  topObjecoes: Array<{ text: string; count: number }>;
  topArgumentos: Array<{ text: string; count: number }>;
  lossStages: Array<{ stage: string; count: number }>;
  confidence: ConfidenceTier;
}

export interface PatternReport {
  generatedAt: string;
  totalMemories: number;
  niches: NichePattern[];
  globalWinRate: number | null;
}

function tier(n: number): ConfidenceTier {
  if (n < 10) return "insuficiente";
  if (n <= 30) return "media";
  return "confiavel";
}

function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) return null;
  return valid.reduce((s, n) => s + n, 0) / valid.length;
}

function topCount(items: string[], limit = 3): Array<{ text: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of items) {
    const t = (raw || "").trim().toLowerCase();
    if (!t || t.length < 4) continue;
    map.set(t, (map.get(t) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface MemoryRow {
  kind: string;
  metadata: Record<string, unknown> | null;
}

export async function computePatterns(opts?: { niche?: string | null }): Promise<PatternReport> {
  const db = admin();
  if (!db) return { generatedAt: new Date().toISOString(), totalMemories: 0, niches: [], globalWinRate: null };

  const { data, error } = await db
    .from("commercial_memory")
    .select("kind, metadata")
    .eq("approved", true)
    .limit(5000);
  if (error || !data) {
    return { generatedAt: new Date().toISOString(), totalMemories: 0, niches: [], globalWinRate: null };
  }

  const rows = (data as MemoryRow[]).filter((r) => {
    if (!opts?.niche) return true;
    return ((r.metadata || {}).niche as string) === opts.niche;
  });

  const byNiche = new Map<string, MemoryRow[]>();
  for (const r of rows) {
    const n = ((r.metadata || {}).niche as string) || "(sem nicho)";
    const arr = byNiche.get(n) || [];
    arr.push(r);
    byNiche.set(n, arr);
  }

  const niches: NichePattern[] = [];
  let globalWon = 0, globalLost = 0;

  for (const [niche, group] of byNiche) {
    const won = group.filter((r) => r.kind === "won_pattern");
    const lost = group.filter((r) => r.kind === "lost_pattern");
    const total = group.length;
    globalWon += won.length; globalLost += lost.length;

    const calls = group.map((r) => Number((r.metadata || {}).calls_count) || 0);
    const meetings = group.map((r) => Number((r.metadata || {}).meetings_count) || 0);
    const durations = group.map((r) => Number((r.metadata || {}).duration_days) || 0);
    const contracts = won.map((r) => Number((r.metadata || {}).contractValue) || 0);

    const objecoes: string[] = [];
    const argumentos: string[] = [];
    const lossStages: string[] = [];
    for (const r of group) {
      const md = r.metadata || {};
      const objs = md.objecoes; if (Array.isArray(objs)) objecoes.push(...(objs as string[]));
      const args = md.argumentos; if (Array.isArray(args)) argumentos.push(...(args as string[]));
      if (r.kind === "lost_pattern" && md.stage) lossStages.push(String(md.stage));
    }

    const decided = won.length + lost.length;
    niches.push({
      niche,
      total,
      won: won.length,
      lost: lost.length,
      winRate: decided >= 10 ? won.length / decided : null,
      avgCalls: avg(calls),
      avgMeetings: avg(meetings),
      avgDurationDays: avg(durations),
      avgContractValue: avg(contracts),
      topObjecoes: topCount(objecoes),
      topArgumentos: topCount(argumentos),
      lossStages: topCount(lossStages, 3).map((x) => ({ stage: x.text, count: x.count })),
      confidence: tier(decided),
    });
  }

  niches.sort((a, b) => b.total - a.total);

  const decidedGlobal = globalWon + globalLost;
  return {
    generatedAt: new Date().toISOString(),
    totalMemories: rows.length,
    niches,
    globalWinRate: decidedGlobal >= 10 ? globalWon / decidedGlobal : null,
  };
}

/** Formata o relatório para injeção em prompts. Filtra padrões < 10 casos. */
export function formatPatternsForPrompt(report: PatternReport, opts?: { niche?: string | null; limit?: number }): string {
  const useful = report.niches.filter((n) => n.confidence !== "insuficiente");
  if (!useful.length) return "";
  const filtered = opts?.niche ? useful.filter((n) => n.niche === opts.niche) : useful;
  const list = (filtered.length ? filtered : useful).slice(0, opts?.limit ?? 5);

  const lines: string[] = [
    "========== PADRÕES ESTATÍSTICOS DA OPERAÇÃO ==========",
    "Fonte: agregação automática da Memória Comercial (apenas padrões com ≥ 10 casos).",
    "Regra: use estes números para calibrar recomendações. NÃO invente estatísticas.",
  ];
  if (report.globalWinRate != null) {
    lines.push(`• Win-rate global: ${(report.globalWinRate * 100).toFixed(0)}% (${report.totalMemories} memórias)`);
  }
  for (const n of list) {
    const conf = n.confidence === "confiavel" ? "Confiável" : "Confiança Média";
    const bits: string[] = [`Nicho ${n.niche} · ${conf} (${n.won + n.lost} casos decididos)`];
    if (n.winRate != null) bits.push(`win-rate ${(n.winRate * 100).toFixed(0)}%`);
    if (n.avgCalls) bits.push(`~${n.avgCalls.toFixed(1)} ligações/lead`);
    if (n.avgMeetings) bits.push(`~${n.avgMeetings.toFixed(1)} reuniões/lead`);
    if (n.avgDurationDays) bits.push(`ciclo médio ${n.avgDurationDays.toFixed(0)}d`);
    if (n.avgContractValue) bits.push(`ticket médio R$ ${Math.round(n.avgContractValue).toLocaleString("pt-BR")}`);
    lines.push(`• ${bits.join(" · ")}`);
    if (n.topObjecoes.length) {
      lines.push(`   Objeções recorrentes: ${n.topObjecoes.map((o) => `${o.text} (${o.count})`).join(" | ")}`);
    }
    if (n.topArgumentos.length) {
      lines.push(`   Argumentos que funcionaram: ${n.topArgumentos.map((a) => `${a.text} (${a.count})`).join(" | ")}`);
    }
    if (n.lossStages.length) {
      lines.push(`   Etapas onde mais se perde: ${n.lossStages.map((s) => `${s.stage} (${s.count})`).join(" | ")}`);
    }
  }
  lines.push("=====================================================");
  return lines.join("\n");
}
