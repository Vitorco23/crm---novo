// Fechamento diário de métricas — Sprint 1 (reestruturação).
// 100% manual: nenhuma métrica automática, nenhuma leitura do activityLedger,
// Matteline/CallFace, Pipeline ou Pomodoro. IA apenas sob clique explícito.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Sparkles } from "lucide-react";
import {
  DIFFICULTY_OPTIONS,
  blastsRates,
  buildAiPayload,
  buildInstantSummary,
  callsRates,
  emptyReport,
  filterHistory,
  fmtRate,
  followupsRates,
  getReport,
  listReports,
  saveReport,
  toDateKey,
  totalMinutes,
  type AiAnalysis,
  type BlastsChannel,
  type CallsChannel,
  type ContextInputs,
  type DailyMetricsReport,
  type FollowupsChannel,
  type GeneralInputs,
  type NumField,
  type OutcomeInputs,
} from "@/modules/intelligence/services/dailyMetricsReport";
import { requestDailyAiAnalysis } from "@/modules/intelligence/services/dailyMetricsAI";

/** Campo numérico que aceita vazio (null) e nunca coage para 0. */
function NumberField({
  id, label, value, onChange, step,
}: { id: string; label: string; value: NumField; onChange: (n: NumField) => void; step?: string }) {
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        placeholder="—"
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw.trim() === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? Math.max(0, n) : null);
        }}
        className="h-9"
      />
    </div>
  );
}

function RateRow({ items }: { items: [string, number | null][] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
      {items.map(([label, v]) => (
        <Badge key={label} variant="outline" className="text-[11px] font-normal">
          {label}: <span className="ml-1 font-semibold text-foreground">{fmtRate(v)}</span>
        </Badge>
      ))}
    </div>
  );
}

type SaveState = "unsaved" | "dirty" | "saved";

export default function MetricasDiarias() {
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<DailyMetricsReport>(() => getReport(today) ?? emptyReport(today));
  const [status, setStatus] = useState<SaveState>(() => (getReport(today) ? "saved" : "unsaved"));
  const [history, setHistory] = useState<DailyMetricsReport[]>(() => listReports());
  const [scope, setScope] = useState<"week" | "month">("week");
  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const existing = getReport(date);
    setReport(existing ?? emptyReport(date));
    setAi(existing?.ai ?? null);
    setStatus(existing ? "saved" : "unsaved");
  }, [date]);

  const patch = useCallback(<K extends keyof DailyMetricsReport>(key: K, value: Partial<DailyMetricsReport[K]>) => {
    setReport((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...(value as object) } as DailyMetricsReport[K] }));
    setStatus((s) => (s === "saved" ? "dirty" : s));
  }, []);

  const setGeneral = (v: Partial<GeneralInputs>) => patch("general", v);
  const setCalls = (v: Partial<CallsChannel>) => patch("calls", v);
  const setBlasts = (v: Partial<BlastsChannel>) => patch("blasts", v);
  const setFollowups = (v: Partial<FollowupsChannel>) => patch("followups", v);
  const setOutcome = (v: Partial<OutcomeInputs>) => patch("outcome", v);
  const setContext = (v: Partial<ContextInputs>) => patch("context", v);

  const cRates = useMemo(() => callsRates(report.calls), [report.calls]);
  const bRates = useMemo(() => blastsRates(report.blasts), [report.blasts]);
  const fRates = useMemo(() => followupsRates(report.followups), [report.followups]);
  const summary = useMemo(() => buildInstantSummary(report), [report]);

  const handleSave = useCallback(() => {
    const saved = saveReport({ ...report, ai });
    setReport(saved);
    setHistory(listReports());
    setStatus("saved");
    toast({ title: "Fechamento salvo", description: `Relatório de ${date} atualizado.` });
  }, [report, ai, date]);

  const handleAi = useCallback(async () => {
    const persisted = getReport(date);
    if (status !== "saved" || !persisted) {
      toast({ title: "Salve o fechamento antes de gerar a análise opcional" });
      return;
    }
    setAiLoading(true);
    try {
      const analysis = await requestDailyAiAnalysis(buildAiPayload(persisted));
      saveReport({ ...persisted, ai: analysis });
      setAi(analysis);
      setHistory(listReports());
      toast({ title: "Análise por IA gerada" });
    } catch (e) {
      toast({ title: "Não foi possível gerar a análise por IA", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }, [date, status]);

  const filtered = useMemo(() => filterHistory(history, scope), [history, scope]);

  const statusBadge =
    status === "saved" ? <Badge variant="secondary" className="text-[11px]">Salvo</Badge>
      : status === "dirty" ? <Badge className="text-[11px] bg-accent text-accent-foreground">Alterações pendentes</Badge>
      : <Badge variant="outline" className="text-[11px]">Não salvo</Badge>;

  const minutes = totalMinutes(report.general);
  const fmtTime = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)}h ${m % 60}min`);

  return (
    <div className="space-y-5">
      {/* 2. Campos gerais */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Fechamento do dia</CardTitle>
            <div className="flex items-center gap-2">
              {statusBadge}
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="m-date" className="text-xs text-muted-foreground">Data</Label>
              <Input id="m-date" type="date" value={date} max={today}
                onChange={(e) => setDate(e.target.value || today)} className="h-9" />
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="m-niche" className="text-xs text-muted-foreground">Nicho prospectado</Label>
              <Input id="m-niche" value={report.general.niche} onChange={(e) => setGeneral({ niche: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="m-region" className="text-xs text-muted-foreground">Cidade / região</Label>
              <Input id="m-region" value={report.general.region} onChange={(e) => setGeneral({ region: e.target.value })} className="h-9" />
            </div>
            <NumberField id="m-goal" label="Meta de reuniões" value={report.general.meetingsGoal} onChange={(n) => setGeneral({ meetingsGoal: n })} />
            <NumberField id="m-hours" label="Horas prospectando" value={report.general.hours} onChange={(n) => setGeneral({ hours: n })} />
            <NumberField id="m-min" label="Minutos" value={report.general.minutes} onChange={(n) => setGeneral({ minutes: n })} />
          </div>
        </CardContent>
      </Card>

      {/* 3-5. Canais */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Ligações</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="c-calls" label="Ligações realizadas" value={report.calls.calls} onChange={(n) => setCalls({ calls: n })} />
              <NumberField id="c-conn" label="Conexões" value={report.calls.connections} onChange={(n) => setCalls({ connections: n })} />
              <NumberField id="c-dm" label="Decisores" value={report.calls.decisionMakers} onChange={(n) => setCalls({ decisionMakers: n })} />
              <NumberField id="c-r1" label="R1 realizadas" value={report.calls.r1} onChange={(n) => setCalls({ r1: n })} />
            </div>
            <RateRow items={[["Conexão", cRates.connection], ["Decisor", cRates.decisionMaker], ["R1", cRates.r1]]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Disparos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="b-sent" label="Mensagens enviadas" value={report.blasts.sent} onChange={(n) => setBlasts({ sent: n })} />
              <NumberField id="b-open" label="Mensagens abertas" value={report.blasts.opened} onChange={(n) => setBlasts({ opened: n })} />
              <NumberField id="b-dm" label="Decisores gerados" value={report.blasts.decisionMakers} onChange={(n) => setBlasts({ decisionMakers: n })} />
              <NumberField id="b-meet" label="Reuniões agendadas" value={report.blasts.meetings} onChange={(n) => setBlasts({ meetings: n })} />
            </div>
            <RateRow items={[["Abertura", bRates.open], ["Decisor", bRates.decisionMaker], ["Reunião", bRates.meeting]]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Follow-ups</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="f-sent" label="Follow-ups enviados" value={report.followups.sent} onChange={(n) => setFollowups({ sent: n })} />
              <NumberField id="f-dm" label="Decisores gerados" value={report.followups.decisionMakers} onChange={(n) => setFollowups({ decisionMakers: n })} />
              <NumberField id="f-meet" label="Reuniões agendadas" value={report.followups.meetings} onChange={(n) => setFollowups({ meetings: n })} />
            </div>
            <RateRow items={[["Decisor", fRates.decisionMaker], ["Reunião", fRates.meeting]]} />
          </CardContent>
        </Card>
      </div>

      {/* 6. Resultado do dia */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Resultado do dia</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <NumberField id="o-r1" label="R1 realizadas (canal Ligações)" value={report.calls.r1} onChange={(n) => setCalls({ r1: n })} />
            <NumberField id="o-sales" label="Vendas fechadas" value={report.outcome.sales} onChange={(n) => setOutcome({ sales: n })} />
            <NumberField id="o-rev" label="Receita coletada (R$)" step="0.01" value={report.outcome.revenue} onChange={(n) => setOutcome({ revenue: n })} />
          </div>
        </CardContent>
      </Card>

      {/* 7 + 8. Contexto e resumo lado a lado */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Contexto do dia</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="x-hour" className="text-xs text-muted-foreground">Melhor horário para conexões</Label>
                <Input id="x-hour" value={report.context.bestHour} onChange={(e) => setContext({ bestHour: e.target.value })} className="h-9" placeholder="ex.: 9h–11h" />
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="x-diff" className="text-xs text-muted-foreground">Principal dificuldade</Label>
                <Select value={report.context.difficulty || undefined} onValueChange={(v) => setContext({ difficulty: v })}>
                  <SelectTrigger id="x-diff" className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="x-goal" className="text-xs text-muted-foreground">Meta batida?</Label>
                <Select
                  value={report.context.goalHit === null ? undefined : report.context.goalHit ? "sim" : "nao"}
                  onValueChange={(v) => setContext({ goalHit: v === "sim" })}
                >
                  <SelectTrigger id="x-goal" className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="x-note" className="text-xs text-muted-foreground">
                {report.context.difficulty === "Outro" ? "Descreva a dificuldade" : "Explicação breve da dificuldade"}
              </Label>
              <Textarea id="x-note" rows={2} value={report.context.difficultyNote} onChange={(e) => setContext({ difficultyNote: e.target.value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="x-obj" className="text-xs text-muted-foreground">Principal objeção recebida</Label>
                <Input id="x-obj" value={report.context.objection} onChange={(e) => setContext({ objection: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="x-learn" className="text-xs text-muted-foreground">Aprendizado do dia</Label>
                <Input id="x-learn" value={report.context.learning} onChange={(e) => setContext({ learning: e.target.value })} className="h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Resumo instantâneo</CardTitle></CardHeader>
          <CardContent>
            <dl className="text-sm divide-y divide-border/40">
              {([
                ["Reuniões agendadas", String(summary.meetingsScheduled)],
                ["Meta de reuniões", summary.meetingsGoal === null ? "—" : String(summary.meetingsGoal)],
                ["Reuniões por hora", summary.meetingsPerHour === null ? "—" : String(summary.meetingsPerHour)],
                ["Tempo prospectando", fmtTime(summary.minutes)],
                ["Canais utilizados", summary.channels.length ? summary.channels.join(", ") : "—"],
                ["Meta batida", summary.goalHit === null ? "—" : summary.goalHit ? "Sim" : "Não"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 py-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* IA opcional */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Análise com IA (opcional)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Nada é enviado à IA até você clicar. O envio contém apenas os números e textos que você digitou.
          </p>
          {status !== "saved" && (
            <p className="text-xs text-muted-foreground">Salve o fechamento antes de gerar a análise opcional</p>
          )}
          <Button variant="outline" onClick={handleAi} disabled={aiLoading || status !== "saved"}>
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

      {/* 10. Histórico */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Histórico</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant={scope === "week" ? "secondary" : "ghost"} onClick={() => setScope("week")}>Esta semana</Button>
              <Button size="sm" variant={scope === "month" ? "secondary" : "ghost"} onClick={() => setScope("month")}>Este mês</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum fechamento salvo neste período.</p>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    {["Data", "Ligações", "Conexões", "Decisores", "R1", "Reuniões", "Vendas", "Receita", "Tempo", "Avaliação"].map((h) => (
                      <th key={h} className="py-2 pr-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const meetings = (r.blasts.meetings ?? 0) + (r.followups.meetings ?? 0) + (r.calls.r1 ?? 0);
                    const dash = (v: NumField) => (v === null ? "—" : String(v));
                    return (
                      <tr key={r.date} className="border-t border-border/40 hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <button type="button" onClick={() => setDate(r.date)}
                            className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                            {r.date}
                          </button>
                        </td>
                        <td className="py-2 pr-3">{dash(r.calls.calls)}</td>
                        <td className="py-2 pr-3">{dash(r.calls.connections)}</td>
                        <td className="py-2 pr-3">{dash(r.calls.decisionMakers)}</td>
                        <td className="py-2 pr-3">{dash(r.calls.r1)}</td>
                        <td className="py-2 pr-3">{meetings}</td>
                        <td className="py-2 pr-3">{dash(r.outcome.sales)}</td>
                        <td className="py-2 pr-3">{r.outcome.revenue === null ? "—" : r.outcome.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        <td className="py-2 pr-3">{fmtTime(totalMinutes(r.general))}</td>
                        <td className="py-2 pr-3">{r.context.goalHit === null ? "—" : r.context.goalHit ? "Meta batida" : "Meta não batida"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="sr-only">{minutes ?? 0}</p>
    </div>
  );
}
