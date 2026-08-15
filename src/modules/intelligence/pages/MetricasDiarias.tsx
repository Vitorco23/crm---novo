// Fechamento diário de métricas — ETAPA 2.
// Página de baixa poluição visual: pulso do dia, formulário de fechamento,
// diagnóstico determinístico (padrão) e análise por IA apenas sob clique.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import {
  buildAiPayload,
  buildAutoMetrics,
  buildRuleDiagnosis,
  emptyManual,
  emptyQualitative,
  emptyResults,
  getReport,
  listReports,
  saveReport,
  toDateKey,
  type AiAnalysis,
  type AutoMetricsSnapshot,
  type DailyMetricsReport,
  type ManualInputs,
  type QualitativeInputs,
  type ResultInputs,
  type RuleDiagnosis,
} from "@/modules/intelligence/services/dailyMetricsReport";
import { requestDailyAiAnalysis } from "@/modules/intelligence/services/dailyMetricsAI";

function Pulse({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[112px] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  id, label, value, onChange,
}: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );
}

export default function MetricasDiarias() {
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const [auto, setAuto] = useState<AutoMetricsSnapshot>(() => buildAutoMetrics(today));
  const [manual, setManual] = useState<ManualInputs>(emptyManual);
  const [results, setResults] = useState<ResultInputs>(emptyResults);
  const [qualitative, setQualitative] = useState<QualitativeInputs>(emptyQualitative);
  const [diagnosis, setDiagnosis] = useState<RuleDiagnosis | null>(null);
  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState<DailyMetricsReport[]>(() => listReports());
  const [saved, setSaved] = useState(false);

  // Troca de data carrega o relatório do dia (se existir) — nunca chama IA.
  useEffect(() => {
    const existing = getReport(date);
    const snapshot = existing?.auto ?? buildAutoMetrics(date);
    setAuto(snapshot);
    setManual(existing?.manual ?? emptyManual());
    setResults(existing?.results ?? emptyResults());
    setQualitative(existing?.qualitative ?? emptyQualitative());
    setAi(existing?.ai ?? null);
    setSaved(!!existing);
    setDiagnosis(
      existing ? buildRuleDiagnosis(existing, listReports()) : null
    );
  }, [date]);

  const currentReport = useMemo<DailyMetricsReport>(
    () => ({ date, updatedAt: new Date().toISOString(), auto, manual, results, qualitative, ai }),
    [date, auto, manual, results, qualitative, ai]
  );

  // Qualquer edição após salvar invalida o "salvo" — impede IA em dados desatualizados.
  const updateManual = useCallback((patch: Partial<ManualInputs>) => {
    setManual((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);
  const updateResults = useCallback((patch: Partial<ResultInputs>) => {
    setResults((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);
  const updateQualitative = useCallback((patch: Partial<QualitativeInputs>) => {
    setQualitative((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  const refreshAuto = useCallback(() => {
    setAuto(buildAutoMetrics(date));
    toast({ title: "Métricas automáticas atualizadas" });
  }, [date]);

  const handleSave = useCallback(() => {
    const snapshot = date === today ? buildAutoMetrics(date) : auto;
    const report: DailyMetricsReport = { ...currentReport, auto: snapshot };
    saveReport(report);
    const all = listReports();
    setAuto(snapshot);
    setHistory(all);
    setDiagnosis(buildRuleDiagnosis(report, all));
    setSaved(true);
    toast({ title: "Fechamento salvo", description: `Relatório de ${date} atualizado.` });
  }, [currentReport, date, today, auto]);

  const regenerate = useCallback(() => {
    setDiagnosis(buildRuleDiagnosis(currentReport, listReports()));
    toast({ title: "Diagnóstico por regras regenerado", description: "Sem custo de IA." });
  }, [currentReport]);

  const handleAi = useCallback(async () => {
    const persisted = getReport(date);
    if (!saved || !persisted) {
      toast({
        title: "Salve o fechamento antes de gerar a análise opcional",
        description: "A IA usa apenas o relatório já salvo do dia.",
      });
      return;
    }
    setAiLoading(true);
    try {
      const payload = buildAiPayload(persisted, listReports());
      const analysis = await requestDailyAiAnalysis(payload);
      saveReport({ ...persisted, ai: analysis });
      setAi(analysis);
      setHistory(listReports());
      toast({ title: "Análise por IA gerada" });
    } catch (e) {
      toast({
        title: "Não foi possível gerar a análise por IA",
        description: (e as Error).message + " O relatório e o diagnóstico por regras seguem válidos.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  }, [date, saved]);

  const lastSync = auto.lastCallfaceAt
    ? new Date(auto.lastCallfaceAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="space-y-6">
      {/* Pulso do dia */}
      <section aria-label="Pulso do dia" className="rounded-lg border border-border/50 bg-card">
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-sm font-semibold text-foreground">Pulso do dia</h2>
          <Button variant="ghost" size="sm" onClick={refreshAuto} className="h-7 text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Atualizar
          </Button>
        </div>
        <div className="flex flex-wrap divide-x divide-border/40 py-1">
          <Pulse label="Pomodoros" value={String(auto.pomodoros)} />
          <Pulse label="Foco" value={`${auto.focusMinutes} min`} />
          <Pulse label="Ligações" value={String(auto.callsConfirmed)} hint="confirmadas CallFace" />
          <Pulse label="Ligações" value={String(auto.callsEstimated)} hint="estimadas (CRM)" />
          <Pulse label="Mensagens" value={String(auto.messagesConfirmed)} hint="confirmadas" />
          <Pulse label="Ações" value={String(auto.totalEstimated)} hint="estimadas" />
          <Pulse label="Reuniões" value={String(auto.meetings)} />
          <Pulse label="Último registro" value={lastSync} hint="Matteline/CallFace" />
        </div>
      </section>

      {/* Fechamento do dia */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Fechamento do dia</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="metrics-date" className="text-xs text-muted-foreground">Data</Label>
              <Input
                id="metrics-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value || today)}
                className="h-8 w-[150px]"
              />
              {saved && <Badge variant="secondary" className="text-[11px]">Salvo</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Complemento externo (o CRM não comprova)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <NumberField id="ext-msg" label="Disparos externos" value={manual.externalMessages} onChange={(n) => updateManual({ externalMessages: n })} />
              <NumberField id="ext-fup" label="Follow-ups externos" value={manual.externalFollowups} onChange={(n) => updateManual({ externalFollowups: n })} />
              <NumberField id="ext-meet" label="Reuniões externas" value={manual.externalMeetings} onChange={(n) => updateManual({ externalMeetings: n })} />
            </div>
            <div className="mt-3 space-y-1">
              <Label htmlFor="day-note" className="text-xs text-muted-foreground">Observação do dia</Label>
              <Textarea id="day-note" rows={2} value={manual.dayNote} onChange={(e) => updateManual({ dayNote: e.target.value })} />
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Resultados</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <NumberField id="res-dm" label="Conexões c/ decisor" value={results.decisionMakerConnections} onChange={(n) => updateResults({ decisionMakerConnections: n })} />
              <NumberField id="res-meet" label="Reuniões marcadas" value={results.meetingsScheduled} onChange={(n) => updateResults({ meetingsScheduled: n })} />
              <NumberField id="res-prop" label="Propostas" value={results.proposals} onChange={(n) => updateResults({ proposals: n })} />
              <NumberField id="res-sales" label="Vendas" value={results.sales} onChange={(n) => updateResults({ sales: n })} />
              <NumberField id="res-rev" label="Receita (R$)" value={results.revenue} onChange={(n) => updateResults({ revenue: n })} />
            </div>
          </div>

          <Separator />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="q-obj" className="text-xs text-muted-foreground">Principal objeção</Label>
              <Input id="q-obj" value={qualitative.mainObjection} onChange={(e) => updateQualitative({ mainObjection: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-bot" className="text-xs text-muted-foreground">Gargalo percebido</Label>
              <Input id="q-bot" value={qualitative.bottleneck} onChange={(e) => updateQualitative({ bottleneck: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-lea" className="text-xs text-muted-foreground">Aprendizado</Label>
              <Input id="q-lea" value={qualitative.learning} onChange={(e) => updateQualitative({ learning: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" /> Salvar fechamento
            </Button>
            <Button variant="outline" onClick={regenerate}>
              <RotateCcw className="h-4 w-4 mr-2" /> Regenerar diagnóstico por regras
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Diagnóstico determinístico */}
      {diagnosis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Diagnóstico por regras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{diagnosis.summary}</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["Conexão", diagnosis.rates.connectionRate],
                ["Reunião", diagnosis.rates.meetingRate],
                ["Proposta", diagnosis.rates.proposalRate],
                ["Venda", diagnosis.rates.saleRate],
              ] as const).map(([label, v]) => (
                <Badge key={label} variant="outline" className="text-[11px]">
                  {label}: {v === null ? "sem base" : `${v}%`}
                </Badge>
              ))}
            </div>
            {diagnosis.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                {diagnosis.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <p><span className="font-medium">Gargalo provável:</span> {diagnosis.bottleneck}</p>
            <div>
              <p className="font-medium mb-1">Recomendações para amanhã</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                {diagnosis.recommendations.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
              </ol>
            </div>
            <div>
              <p className="font-medium mb-1">Metas sugeridas</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {diagnosis.suggestedGoals.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* IA opcional */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Análise com IA (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Opcional e sob demanda: nada é enviado à IA até você clicar. O envio contém apenas números
            agregados do dia e o texto que você digitou — nunca leads, telefones, interações ou transcrições.
          </p>
          {!saved && (
            <p className="text-xs text-muted-foreground">
              Salve o fechamento antes de gerar a análise opcional
            </p>
          )}
          <Button variant="outline" onClick={handleAi} disabled={aiLoading || !saved}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {ai ? "Regenerar análise com IA" : "Gerar análise com IA (opcional)"}
          </Button>
          {ai && (
            <div className="rounded-md border border-border/50 p-3 space-y-2">
              <p className="whitespace-pre-wrap text-foreground">{ai.text}</p>
              <p className="text-[11px] text-muted-foreground">
                Gerado em {new Date(ai.generatedAt).toLocaleString("pt-BR")}{ai.model ? ` · ${ai.model}` : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fechamentos anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum fechamento salvo ainda.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {history.slice(0, 30).map((r) => (
                <li key={r.date}>
                  <button
                    type="button"
                    onClick={() => setDate(r.date)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:bg-muted/40 rounded px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="font-medium">{r.date}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.auto.callsConfirmed} conf. · {r.auto.callsEstimated} est. · {r.results.meetingsScheduled} reuniões · {r.results.sales} vendas
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
