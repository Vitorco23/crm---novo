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
} from "@/modules/intelligence/services/diretorIA";
import NextBestActionCard from "@/modules/intelligence/components/NextBestActionCard";
import { buildStrategicMemory } from "@/modules/intelligence/services/strategicMemory";
import { useAIUserContext } from "@/shared/hooks/useProfile";

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
  const userContext = useAIUserContext();

  const refresh = () => {
    setToday(getTodayParecer());
    setHistory(getHistory());
  };

  const run = async (silent = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const p = await generateParecer(userContext);
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

function MetaBar({ label, atual, meta, icon }: { label: string; atual: number; meta: number; icon: React.ReactNode }) {
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0;
  const done = meta > 0 && atual >= meta;
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {icon}{label}
        </div>
        <div className={`text-sm font-mono font-semibold tabular-nums ${done ? "text-accent" : ""}`}>
          {atual}<span className="text-muted-foreground"> / {meta || "—"}</span>
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

function SectionCard({
  icon, title, tone = "default", children,
}: {
  icon: React.ReactNode; title: string;
  tone?: "default" | "danger" | "success" | "accent";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "border-l-destructive" :
    tone === "success" ? "border-l-accent" :
    tone === "accent" ? "border-l-primary" :
    "border-l-border";
  return (
    <div className={`rounded-md border border-l-4 ${toneClass} bg-background p-3`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-2">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function BulletList({ items, emptyText = "Sem dados." }: { items: string[]; emptyText?: string }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground italic">{emptyText}</div>;
  }
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="text-[13px] leading-snug flex gap-2">
          <span className="text-muted-foreground shrink-0">•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Checklist({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground italic">Sem prioridades definidas.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="text-[13px] leading-snug flex gap-2 items-start">
          <span className="mt-[3px] h-3.5 w-3.5 rounded border border-muted-foreground/50 shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function AnaliseExecutiva({ analise }: { analise: NonNullable<Parecer["analise"]> }) {
  return (
    <div className="space-y-3">
      {/* Diagnóstico executivo */}
      <div className="rounded-md border-l-4 border-l-primary bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
          <BrainCircuit className="h-3.5 w-3.5" /> Diagnóstico executivo
        </div>
        <div className="text-[13px] leading-snug">{analise.diagnostico}</div>
        {analise.tendencia && (
          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 mt-[1px] shrink-0" />
            <span>{analise.tendencia}</span>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Gargalo único */}
        <SectionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="🚧 Principal gargalo" tone="danger">
          <div className="text-[13px] font-semibold leading-snug">
            {analise.gargalo.titulo || "Sem gargalo identificado."}
          </div>
          {analise.gargalo.evidencia && (
            <div className="text-[12px] text-muted-foreground mt-1 leading-snug">
              {analise.gargalo.evidencia}
            </div>
          )}
        </SectionCard>

        {/* Impacto financeiro */}
        <SectionCard icon={<Target className="h-3.5 w-3.5" />} title="💰 Impacto financeiro">
          <div className="text-[13px] leading-snug">
            {analise.impactoFinanceiro || "Sem dados suficientes."}
          </div>
        </SectionCard>
      </div>

      {/* Decisão do dia */}
      <div className="rounded-md border-l-4 border-l-accent bg-accent/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-foreground/80 mb-1">
          <Lightbulb className="h-3.5 w-3.5" /> Decisão do dia
        </div>
        <div className="text-[13px] leading-snug font-medium">{analise.decisaoDoDia}</div>
      </div>

      {/* Plano de ataque */}
      <SectionCard icon={<CheckSquare className="h-3.5 w-3.5" />} title="⚔ Plano de ataque" tone="accent">
        <Checklist items={analise.planoDeAtaque} />
      </SectionCard>
    </div>
  );
}

/**
 * Memória Estratégica (Sprint 3) — evolução determinística da operação
 * e acompanhamento das decisões anteriores do Diretor. Sem inferência de IA.
 */
function MemoriaEstrategicaPanel() {
  const mem = useMemo(() => {
    try { return buildStrategicMemory(); } catch { return null; }
  }, []);
  if (!mem) return null;

  const semDados = !mem.amostra.suficienteParaTendencia;
  const dec = mem.decisoesAnteriores[0];
  const vereditoLabel: Record<string, string> = {
    melhorou: "melhorou", piorou: "piorou", estavel: "sem mudança relevante",
    sem_dados: "sem dados suficientes para avaliar",
  };

  return (
    <SectionCard icon={<TrendingUp className="h-3.5 w-3.5" />} title="🧭 Memória Estratégica">
      {semDados ? (
        <div className="text-[13px] text-muted-foreground">
          Ainda não há dados suficientes para concluir tendências
          ({mem.amostra.diasComDados} dias com atividade, {mem.amostra.totalLigacoes30d} ligações em 30 dias).
        </div>
      ) : (
        <div className="space-y-2 text-[13px]">
          <div className="text-xs text-muted-foreground">{mem.semanaVsAnterior.janela}</div>
          {mem.melhorou.length > 0 && (
            <div>
              <span className="font-medium text-emerald-500">Melhorou: </span>
              {mem.melhorou.slice(0, 3).join(" · ")}
            </div>
          )}
          {mem.piorou.length > 0 && (
            <div>
              <span className="font-medium text-destructive">Piorou: </span>
              {mem.piorou.slice(0, 3).join(" · ")}
            </div>
          )}
          {mem.estavel.length > 0 && (
            <div className="text-muted-foreground">
              Estável: {mem.estavel.slice(0, 2).join(" · ")}
            </div>
          )}
          {mem.produtividade.suficiente && mem.produtividade.melhorFaixaHoraria && (
            <div className="text-muted-foreground">
              Melhor janela de produção: {mem.produtividade.melhorFaixaHoraria.faixa}
              {mem.produtividade.melhorDiaSemana ? ` · melhor dia: ${mem.produtividade.melhorDiaSemana.dia}` : ""}
            </div>
          )}
          {mem.financeiro.custoOperacionalPorReuniao !== null && (
            <div className="text-muted-foreground">
              Custo operacional: {mem.financeiro.custoOperacionalPorReuniao} ligações por reunião
              {mem.financeiro.custoOperacionalPorVenda !== null
                ? ` · ${mem.financeiro.custoOperacionalPorVenda} por venda`
                : ""}
            </div>
          )}
          {dec && (
            <div className="pt-1 border-t text-muted-foreground">
              Decisão de {formatDatePt(dec.data)}: “{dec.decisao}” —{" "}
              {vereditoLabel[dec.resultado.veredito]}.
            </div>
          )}
          {mem.padroesPersistentes.map((p, i) => (
            <div key={i} className="text-amber-500">{p}</div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ParecerViewer({ parecer, compact }: { parecer: Parecer; compact?: boolean }) {
  const painel = parecer.painel;
  const analise = parecer.analise;
  const meta = parecer.metaHoje;


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {formatDatePt(parecer.date)} · gerado às{" "}
          {new Date(parecer.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">{parecer.model}</Badge>
      </div>

      {/* Próxima Melhor Ação — topo do parecer */}
      {parecer.nextBestAction && (
        <NextBestActionCard nba={parecer.nextBestAction} compact={compact} />
      )}

      {/* Formato legado (markdown) — fallback */}
      {!painel && parecer.content && (
        <div className="rounded-lg border bg-background p-4">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-h2:text-base prose-h2:font-semibold prose-p:my-1 prose-ul:my-1 prose-li:my-0">
            <ReactMarkdown>{parecer.content}</ReactMarkdown>
          </div>
        </div>
      )}


      {analise && <AnaliseExecutiva analise={analise} />}

      <MemoriaEstrategicaPanel />


      {painel && (

        <div className="grid gap-3 md:grid-cols-2">
          {/* Resumo de Ontem */}
          <SectionCard icon={<TrendingUp className="h-3.5 w-3.5" />} title="📈 Resumo de Ontem">
            <BulletList items={painel.resumoOntem} emptyText="Sem atividade registrada ontem." />
          </SectionCard>

          {/* Meta de Hoje */}
          <SectionCard icon={<Target className="h-3.5 w-3.5" />} title="🎯 Meta de Hoje" tone="accent">
            {meta ? (
              <div className="space-y-2">
                <MetaBar label="Ligações" atual={meta.ligacoes.atual} meta={meta.ligacoes.meta}
                  icon={<Phone className="h-3 w-3" />} />
                <MetaBar label="Reuniões" atual={meta.reunioes.atual} meta={meta.reunioes.meta}
                  icon={<Calendar className="h-3 w-3" />} />
                <MetaBar label="Vendas" atual={meta.vendas.atual} meta={meta.vendas.meta}
                  icon={<Sparkles className="h-3 w-3" />} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">Sem metas configuradas.</div>
            )}
          </SectionCard>

          {/* Atenção (apenas no formato legado — substituído pelo gargalo único) */}
          {!analise && (
            <SectionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="🚨 O que merece atenção" tone="danger">
              <BulletList items={painel.atencao} emptyText="Nada crítico no momento." />
            </SectionCard>
          )}

          {/* Oportunidades */}
          <SectionCard icon={<TrendingUp className="h-3.5 w-3.5" />} title="📈 Oportunidades" tone="success">
            <BulletList items={painel.oportunidades} emptyText="Sem oportunidades destacadas." />
          </SectionCard>

          {/* Prioridades - full width (legado; substituído pelo Plano de Ataque) */}
          {!analise && (
            <div className="md:col-span-2">
              <SectionCard icon={<CheckSquare className="h-3.5 w-3.5" />} title="✅ Prioridades para Hoje" tone="accent">
                <Checklist items={painel.prioridades} />
              </SectionCard>
            </div>
          )}

          {/* Dica - full width (legado; substituído pela Decisão do Dia) */}
          {!analise && painel.dica && (
            <div className="md:col-span-2">
              <div className="rounded-md border-l-4 border-l-primary bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                  <Lightbulb className="h-3.5 w-3.5" />💡 Dica do Diretor Comercial
                </div>
                <div className="text-[13px] leading-snug italic">"{painel.dica}"</div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
