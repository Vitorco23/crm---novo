import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sparkles, RefreshCw, Settings2, CheckCircle2, AlertTriangle,
  Zap, Info, TrendingUp, Lightbulb,
} from "lucide-react";
import {
  runInsightsEngine, getInsights, sortInsights, getRules, setRuleEnabled,
  getLastRunAt, saveInsights,
  CATEGORY_LABELS, PRIORITY_LABELS,
  type Insight, type InsightPriority, type InsightCategory,
} from "@/lib/insights";
import { toast } from "@/hooks/use-toast";

const PRIORITY_STYLES: Record<InsightPriority, { badge: string; dot: string; ring: string }> = {
  critica: { badge: "bg-rose-500/15 text-rose-500 border-rose-500/30", dot: "bg-rose-500", ring: "border-l-rose-500" },
  alta:    { badge: "bg-amber-500/15 text-amber-600 border-amber-500/30", dot: "bg-amber-500", ring: "border-l-amber-500" },
  media:   { badge: "bg-sky-500/15 text-sky-500 border-sky-500/30", dot: "bg-sky-500", ring: "border-l-sky-500" },
  baixa:   { badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", ring: "border-l-muted" },
};

const CONF_LABEL = { high: "Alta confiança", medium: "Média confiança", low: "Baixa confiança" } as const;

function fmtRel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<"all" | InsightPriority>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | InsightCategory>("all");
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [rulesOpen, setRulesOpen] = useState(false);

  const refresh = () => {
    setInsights(getInsights());
    setLastRun(getLastRunAt());
  };

  useEffect(() => {
    // Roda o motor automaticamente ao abrir se nunca rodou ou já se passou >10min
    const last = getLastRunAt();
    if (!last || Date.now() - new Date(last).getTime() > 10 * 60 * 1000) {
      handleRun(true);
    } else {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = (silent = false) => {
    setRunning(true);
    setTimeout(() => {
      const r = runInsightsEngine();
      refresh();
      setRunning(false);
      if (!silent) {
        toast({
          title: "Motor executado",
          description: `${r.createdCount} novos · ${r.updatedCount} atualizados · ${r.resolvedCount} resolvidos.`,
        });
      }
    }, 50);
  };

  const filtered = useMemo(() => {
    const base = insights.filter((i) => i.status === tab);
    return sortInsights(base).filter((i) => {
      if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      return true;
    });
  }, [insights, tab, priorityFilter, categoryFilter]);

  const activeCount = insights.filter((i) => i.status === "active").length;
  const criticalCount = insights.filter((i) => i.status === "active" && i.priority === "critica").length;

  const resolveManually = (id: string) => {
    const all = getInsights();
    const i = all.find((x) => x.id === id);
    if (!i) return;
    i.status = "resolved"; i.resolvedAt = new Date().toISOString(); i.updatedAt = i.resolvedAt;
    saveInsights(all);
    refresh();
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              Motor de Insights Inteligentes
              {criticalCount > 0 && (
                <Badge className={PRIORITY_STYLES.critica.badge + " border"}>
                  {criticalCount} crítico(s)
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Diretor comercial digital: analisa dados reais do CRM através de regras determinísticas
              e destaca ações prioritárias. {lastRun && <>Última execução: {fmtRel(lastRun)}.</>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" /> Regras
            </Button>
            <Button size="sm" onClick={() => handleRun(false)} disabled={running}>
              <RefreshCw className={"h-4 w-4 mr-1 " + (running ? "animate-spin" : "")} />
              Analisar agora
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="active" className="text-xs">Ativos ({activeCount})</TabsTrigger>
              <TabsTrigger value="resolved" className="text-xs">Histórico</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as prioridades</SelectItem>
              {(Object.keys(PRIORITY_LABELS) as InsightPriority[]).map((p) => (
                <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as categorias</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as InsightCategory[]).map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 p-8 text-center">
            <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {tab === "active"
                ? "Nenhum insight ativo com os filtros atuais. Rode o motor ou aguarde mais dados."
                : "Nenhum insight no histórico ainda."}
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((i) => (
              <InsightItem key={i.id} insight={i} onResolve={() => resolveManually(i.id)} showResolve={tab === "active"} />
            ))}
          </div>
        )}
      </CardContent>

      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} onChange={refresh} />
    </Card>
  );
}

function InsightItem({ insight, onResolve, showResolve }: {
  insight: Insight; onResolve: () => void; showResolve: boolean;
}) {
  const s = PRIORITY_STYLES[insight.priority];
  const icon =
    insight.priority === "critica" ? <AlertTriangle className="h-4 w-4" /> :
    insight.priority === "alta"    ? <Zap className="h-4 w-4" /> :
    insight.category === "financeiro" || insight.category === "comercial" ? <TrendingUp className="h-4 w-4" /> :
    <Lightbulb className="h-4 w-4" />;
  return (
    <div className={`rounded-lg border border-l-4 ${s.ring} p-3 bg-card`}>
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-md ${s.badge} border flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium">{insight.title}</div>
            <Badge variant="outline" className={s.badge + " border text-[10px] uppercase tracking-wider"}>
              {PRIORITY_LABELS[insight.priority]}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {CATEGORY_LABELS[insight.category]}
            </Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {CONF_LABEL[insight.confidence]} · {fmtRel(insight.updatedAt)}
            </span>
          </div>
          <div className="text-sm mt-1">{insight.description}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <strong className="text-foreground/80">Motivo:</strong> {insight.reason}
          </div>
          <div className="text-xs mt-1 rounded bg-muted/40 px-2 py-1 flex items-start gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div><strong className="text-foreground/80">Sugestão:</strong> {insight.suggestion}</div>
          </div>
          {showResolve && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onResolve}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar como resolvido
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesDialog({ open, onOpenChange, onChange }: {
  open: boolean; onOpenChange: (v: boolean) => void; onChange: () => void;
}) {
  const [tick, setTick] = useState(0);
  const rules = useMemo(() => getRules(), [tick, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regras do Motor de Insights</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.name}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{CATEGORY_LABELS[r.category]}</Badge>
                  <Badge variant="outline" className={PRIORITY_STYLES[r.defaultPriority].badge + " border text-[10px] uppercase"}>
                    {PRIORITY_LABELS[r.defaultPriority]}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ID: {r.id} {r.lastRunAt && <>· última execução {fmtRel(r.lastRunAt)}</>}
                </div>
              </div>
              <Switch
                checked={r.enabled}
                onCheckedChange={(v) => { setRuleEnabled(r.id, v); setTick((t) => t + 1); onChange(); }}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
