// Laboratório Comercial — Motor de recomendações.
// Sempre justifica com dados reais do ranking. Isolado da UI para permitir
// futura substituição por IA (Constituição §19).

import type { LabDimension, LabRecommendation, RankingRow } from "./types";

const DIM_LABEL: Record<LabDimension, { one: string; scale: string }> = {
  script:      { one: "script",       scale: "escalar uso" },
  campaign:    { one: "campanha",     scale: "escalar investimento" },
  city:        { one: "cidade",       scale: "escalar prospecção" },
  niche:       { one: "nicho",        scale: "escalar abordagem" },
  hour:        { one: "horário",      scale: "priorizar bloco" },
  responsible: { one: "responsável",  scale: "replicar padrão" },
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function buildRecommendations(
  dimension: LabDimension,
  ranking: RankingRow[]
): LabRecommendation[] {
  if (!ranking.length) return [];
  const valid = ranking.filter((r) => r.confidence !== "low");
  if (!valid.length) {
    return [{
      id: `${dimension}-low`,
      dimension,
      severity: "attention",
      title: "Amostra insuficiente para conclusão",
      rationale: `Nenhum ${DIM_LABEL[dimension].one} possui volume estatístico suficiente no período. Aumente a base de ligações antes de tirar conclusões.`,
    }];
  }
  const winner = valid[0];
  const loser = valid[valid.length - 1];
  const recs: LabRecommendation[] = [];

  recs.push({
    id: `${dimension}-winner-${winner.key}`,
    dimension,
    severity: "positive",
    title: `Escalar: ${winner.label}`,
    rationale: `Melhor ${DIM_LABEL[dimension].one} do período com ${pct(winner.metrics.conversion)} de conversão, ${winner.metrics.meetings} reuniões e ${brl(winner.metrics.revenue)} de receita. Recomenda-se ${DIM_LABEL[dimension].scale}.`,
    metricSummary: `Score ${winner.score} · ${winner.metrics.calls} ligações`,
  });

  if (valid.length > 1 && loser.key !== winner.key
      && winner.metrics.conversion > loser.metrics.conversion * 1.3) {
    recs.push({
      id: `${dimension}-loser-${loser.key}`,
      dimension,
      severity: "critical",
      title: `Revisar: ${loser.label}`,
      rationale: `Conversão de ${pct(loser.metrics.conversion)} — ${((winner.metrics.conversion / Math.max(loser.metrics.conversion, 0.0001) - 1) * 100).toFixed(0)}% abaixo do líder. Considere pausar ou reformular a abordagem antes de investir mais.`,
      metricSummary: `${loser.metrics.calls} ligações · ${brl(loser.metrics.revenue)}`,
    });
  }

  // recomendação específica p/ horário
  if (dimension === "hour" && winner) {
    recs.push({
      id: `hour-priority-${winner.key}`,
      dimension,
      severity: "positive",
      title: `Priorizar prospecção no bloco ${winner.label}`,
      rationale: `Taxa de reunião de ${pct(winner.metrics.meetingRate)} no bloco vs. média geral. Concentrar cadência de ligações nessa faixa maximiza produtividade.`,
    });
  }
  return recs;
}
