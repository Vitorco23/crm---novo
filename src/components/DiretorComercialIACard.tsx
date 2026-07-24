import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, RefreshCw, Sparkles, Calendar, BrainCircuit,
  TrendingUp, AlertTriangle, Target, CheckSquare, Lightbulb, Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateParecer, getHistory, getTodayParecer, shouldRunToday,
  todayKey, type Parecer,
} from "@/lib/diretorIA";

function formatDatePt(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return dateStr; }
}

export default function DiretorComercialIACard() {
  const [today, setToday] = useState<Parecer | null>(() => getTodayParecer());
  const [history, setHistory] = useState<Parecer[]>(() => getHistory());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"today" | "history">("today");
  const [selectedHistId, setSelectedHistId] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const refresh = () => {
    setToday(getTodayParecer());
    setHistory(getHistory());
  };

  const run = async (silent = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const p = await generateParecer();
      setToday(p);
      setHistory(getHistory());
      if (!silent) toast.success("Parecer diário gerado");
    } catch (e: any) {
      console.error("[diretor-ia]", e);
      const msg = e?.message || "Falha ao gerar parecer";
      toast.error(msg.slice(0, 220));
    } finally {
      setLoading(false);
    }
  };

  // Auto-run 1x/dia
  useEffect(() => {
    if (autoTried) return;
    setAutoTried(true);
    if (shouldRunToday() && !getTodayParecer()) {
      run(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza entre dispositivos / entre montagens
  useEffect(() => {
    const bump = () => refresh();
    window.addEventListener("p21:diretor-ia-updated", bump);
    window.addEventListener("p21:storage-synced", bump as EventListener);
    return () => {
      window.removeEventListener("p21:diretor-ia-updated", bump);
      window.removeEventListener("p21:storage-synced", bump as EventListener);
    };
  }, []);

  const historyOrdered = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date)),
    [history]
  );

  const selectedHist = useMemo(() => {
    if (!selectedHistId) return historyOrdered.find((p) => p.date !== todayKey()) ?? null;
    return historyOrdered.find((p) => p.id === selectedHistId) ?? null;
  }, [historyOrdered, selectedHistId]);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
              📊 Diretor Comercial IA
              {today && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  Atualizado hoje
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Parecer estratégico automático da operação, gerado 1x por dia.
              {today && <> Última análise: <b>{formatDatePt(today.date)}</b>.</>}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => run(false)}
            disabled={loading}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-1" /> Gerar novamente</>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-8 mb-3">
            <TabsTrigger value="today" className="text-xs">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Hoje
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1" /> Histórico ({historyOrdered.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="mt-0">
            {loading && !today && (
              <div className="rounded-lg border bg-muted/20 p-8 text-center">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  Analisando operação... isso leva alguns segundos.
                </div>
              </div>
            )}
            {!loading && !today && (
              <div className="rounded-lg border bg-muted/20 p-8 text-center">
                <BrainCircuit className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm text-muted-foreground mb-3">
                  Ainda não há parecer para hoje.
                </div>
                <Button size="sm" onClick={() => run(false)} disabled={loading}>
                  <Sparkles className="h-4 w-4 mr-1" /> Gerar agora
                </Button>
              </div>
            )}
            {today && <ParecerViewer parecer={today} />}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {historyOrdered.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Nenhum histórico ainda.
              </div>
            ) : (
              <div className="grid md:grid-cols-[220px_1fr] gap-3">
                <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
                  {historyOrdered.map((p) => {
                    const isSelected = (selectedHist?.id ?? historyOrdered[0].id) === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedHistId(p.id)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/40 transition ${
                          isSelected ? "bg-muted/60" : ""
                        }`}
                      >
                        <div className="font-medium">{formatDatePt(p.date)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(p.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div>
                  {(selectedHist ?? historyOrdered[0]) && (
                    <ParecerViewer parecer={selectedHist ?? historyOrdered[0]} compact />
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ParecerViewer({ parecer, compact }: { parecer: Parecer; compact?: boolean }) {
  return (
    <div className={`rounded-lg border bg-background p-4 ${compact ? "" : ""}`}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {formatDatePt(parecer.date)} · gerado às{" "}
          {new Date(parecer.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">{parecer.model}</Badge>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-h2:text-base prose-h2:font-semibold prose-p:my-1 prose-ul:my-1 prose-li:my-0">
        <ReactMarkdown>{parecer.content}</ReactMarkdown>
      </div>
    </div>
  );
}
