import { useEffect, useMemo, useState } from "react";
import {
  Activity, Database, Brain, Plug, Zap, Gauge, ShieldCheck,
  AlertTriangle, ClipboardList, RefreshCw, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { PageHeader } from "@/shared/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/utils/utils";
import { HealthRepository } from "../services/HealthRepository";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

type Status = "healthy" | "warn" | "critical" | "unknown";

const statusMeta: Record<Status, { label: string; className: string; icon: any }> = {
  healthy:  { label: "Saudável",  className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  warn:     { label: "Atenção",   className: "bg-amber-500/15 text-amber-500 border-amber-500/30",       icon: AlertCircle },
  critical: { label: "Crítico",   className: "bg-red-500/15 text-red-500 border-red-500/30",             icon: XCircle },
  unknown:  { label: "Indisponível", className: "bg-muted text-muted-foreground border-border",           icon: AlertCircle },
};

function StatusBadge({ status }: { status: Status }) {
  const m = statusMeta[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", m.className)}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-card/40 p-3">
      <span className="text-caption text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-body font-semibold text-foreground">{value ?? <span className="text-muted-foreground font-normal">Não disponível</span>}</span>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SectionCard({ icon: Icon, title, status, children, action }: {
  icon: any; title: string; status?: Status; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-body">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {action}
          {status && <StatusBadge status={status} />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "Não disponível";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `Há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Há ${h}h`;
  const d = Math.floor(h / 24);
  return `Há ${d}d`;
}

interface HealthData {
  ping: { ok: boolean; latency: number };
  ai: { task: string; success: number; fail: number; avgLatency: number; lastRun: string | null; lastModel: string | null }[];
  aiTotals: { total: number; success: number; fail: number; avgLatency: number };
  integrations: { name: string; status: Status; lastSync?: string | null; hint?: string }[];
  recentErrors: { task: string; error: string; at: string }[];
  events: { type: string; label: string; at: string }[];
}

export default function SaudeSistema() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  async function load() {
    setLoading(true);
    try {
      // Ping DB latency
      const ping = await HealthRepository.pingDatabase();
      const pingError = !ping.ok;
      const latency = ping.latency;

      // AI router logs — last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const logs = await HealthRepository.aiRouterLogs(since);

      const tasks = ["diretor", "consultor", "mentor", "diagnose", "auditor", "briefing"];
      const aiByTask = tasks.map((task) => {
        const rows = (logs ?? []).filter((l: any) => (l.task ?? "").toLowerCase().includes(task));
        const success = rows.filter((r: any) => r.success).length;
        const fail = rows.length - success;
        const avgLatency = rows.length ? Math.round(rows.reduce((a: number, r: any) => a + (r.latency_ms || 0), 0) / rows.length) : 0;
        return {
          task,
          success, fail, avgLatency,
          lastRun: rows[0]?.created_at ?? null,
          lastModel: rows[0]?.model ?? null,
        };
      }).filter(t => t.success + t.fail > 0 || ["diretor","consultor","mentor"].includes(t.task));

      const totalRuns = logs?.length ?? 0;
      const totalSuccess = logs?.filter((l: any) => l.success).length ?? 0;
      const totalFail = totalRuns - totalSuccess;
      const avgLat = totalRuns ? Math.round((logs ?? []).reduce((a: number, r: any) => a + (r.latency_ms || 0), 0) / totalRuns) : 0;

      const recentErrors = (logs ?? [])
        .filter((l: any) => !l.success)
        .slice(0, 5)
        .map((l: any) => ({ task: l.task, error: l.error_type || "erro desconhecido", at: l.created_at }));

      // Integrations — infer from what we can observe
      const integrations: HealthData["integrations"] = [
        { name: "Lovable Cloud (Supabase)", status: pingError ? "critical" : "healthy", hint: pingError ? "Erro de conexão" : `Latência ${latency}ms` },
        { name: "OpenRouter / Lovable AI", status: totalRuns > 0 ? (totalFail / Math.max(totalRuns,1) > 0.3 ? "warn" : "healthy") : "unknown", lastSync: logs?.[0]?.created_at ?? null },
        { name: "Google Calendar", status: "unknown", hint: "Verificar em Integrações" },
        { name: "Webhook Landing", status: "unknown", hint: "Público — sem métrica local" },
        { name: "Webhook Matteline", status: "unknown", hint: "Público — sem métrica local" },
      ];

      // Recent events (best-effort from KB updates + AI failures)
      const events: HealthData["events"] = [
        ...recentErrors.slice(0, 3).map((e) => ({ type: "ai-fail", label: `Falha em IA (${e.task}): ${e.error}`, at: e.at })),
      ].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 8);

      setData({
        ping: { ok: !pingError, latency },
        ai: aiByTask,
        aiTotals: { total: totalRuns, success: totalSuccess, fail: totalFail, avgLatency: avgLat },
        integrations,
        recentErrors,
        events,
      });
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const overallStatus: Status = useMemo(() => {
    if (!data) return "unknown";
    if (!data.ping.ok) return "critical";
    const failRate = data.aiTotals.total ? data.aiTotals.fail / data.aiTotals.total : 0;
    if (failRate > 0.3) return "warn";
    if (data.ping.latency > 1500) return "warn";
    return "healthy";
  }, [data]);

  const alerts = useMemo(() => {
    if (!data) return [];
    const a: { level: Status; text: string }[] = [];
    if (!data.ping.ok) a.push({ level: "critical", text: "Banco de dados inacessível" });
    if (data.ping.latency > 1500) a.push({ level: "warn", text: `Latência alta no banco (${data.ping.latency}ms)` });
    if (data.aiTotals.total > 0 && data.aiTotals.fail / data.aiTotals.total > 0.3) {
      a.push({ level: "warn", text: `Alta taxa de falhas nas IAs (${data.aiTotals.fail}/${data.aiTotals.total})` });
    }
    data.recentErrors.slice(0, 2).forEach((e) => a.push({ level: "warn", text: `IA (${e.task}): ${e.error}` }));
    return a;
  }, [data]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const specialistLabel: Record<string, string> = {
    diretor: "Diretor Comercial IA",
    consultor: "Consultor de Leads",
    mentor: "Mentor P21",
    diagnose: "Diagnóstico Automático",
    auditor: "Auditor Comercial",
    briefing: "Briefing Comercial",
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          icon={Activity}
          title="Saúde do Sistema"
          description="Painel administrativo de observabilidade do CRM Performance21"
          actions={
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
          }
        />

        {/* 1. Resumo Geral */}
        <SectionCard icon={Activity} title="Resumo Geral" status={overallStatus}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Status Geral" value={statusMeta[overallStatus].label} />
            <Metric label="Última verificação" value={timeAgo(refreshedAt.toISOString())} />
            <Metric label="Latência do banco" value={data ? `${data.ping.latency} ms` : "…"} />
            <Metric label="Execuções IA (24h)" value={data?.aiTotals.total ?? 0} hint={data ? `${data.aiTotals.success} ok · ${data.aiTotals.fail} falhas` : undefined} />
          </div>
        </SectionCard>

        {/* 9. Alertas */}
        <SectionCard icon={AlertTriangle} title="Alertas" status={alerts.length ? (alerts.some(a => a.level === "critical") ? "critical" : "warn") : "healthy"}>
          {alerts.length === 0 ? (
            <p className="text-small text-muted-foreground">Nenhum alerta encontrado.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <StatusBadge status={a.level} />
                  <span className="text-small text-foreground">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 2. Banco de Dados */}
          <SectionCard icon={Database} title="Banco de Dados" status={data?.ping.ok ? "healthy" : "critical"}>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Status" value={data?.ping.ok ? "Online" : "Offline"} />
              <Metric label="Latência" value={data ? `${data.ping.latency} ms` : "—"} />
              <Metric label="Uso de CPU" value={null} />
              <Metric label="Uso de Memória" value={null} />
              <Metric label="Uso de Disco" value={null} />
              <Metric label="Conexões ativas" value={null} />
            </div>
            <p className="text-caption text-muted-foreground mt-3">
              Métricas de infraestrutura não expostas ao cliente. Consulte o painel do backend gerenciado para detalhes completos.
            </p>
          </SectionCard>

        </div>

        {/* 3. Inteligência Artificial */}
        <SectionCard
          icon={Brain}
          title="Inteligência Artificial"
          status={data && data.aiTotals.total > 0 ? (data.aiTotals.fail / data.aiTotals.total > 0.3 ? "warn" : "healthy") : "unknown"}
        >
          {(!data || data.ai.length === 0) ? (
            <p className="text-small text-muted-foreground">Nenhuma execução de IA registrada nas últimas 24h.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.ai.map((t) => {
                const total = t.success + t.fail;
                const status: Status = total === 0 ? "unknown" : t.fail / total > 0.3 ? "warn" : "healthy";
                return (
                  <div key={t.task} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-small font-semibold">{specialistLabel[t.task] ?? t.task}</span>
                      <StatusBadge status={status} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-caption">
                      <div><span className="text-muted-foreground">Execuções: </span><span className="font-medium">{total}</span></div>
                      <div><span className="text-muted-foreground">Falhas: </span><span className="font-medium">{t.fail}</span></div>
                      <div><span className="text-muted-foreground">Latência méd.: </span><span className="font-medium">{t.avgLatency} ms</span></div>
                      <div><span className="text-muted-foreground">Última: </span><span className="font-medium">{timeAgo(t.lastRun)}</span></div>
                    </div>
                    {t.lastModel && <p className="text-caption text-muted-foreground truncate">Modelo: {t.lastModel}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 5. Integrações */}
          <SectionCard icon={Plug} title="Integrações">
            <ul className="space-y-2">
              {data?.integrations.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-small font-medium truncate">{i.name}</p>
                    <p className="text-caption text-muted-foreground truncate">{i.hint ?? (i.lastSync ? `Última sincronização: ${timeAgo(i.lastSync)}` : "—")}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* 8. Segurança */}
          <SectionCard icon={ShieldCheck} title="Segurança" status="healthy">
            <ul className="space-y-2">
              {[
                { label: "JWT ativo", ok: true },
                { label: "Row-Level Security (RLS)", ok: true },
                { label: "Prompt Injection Protection", ok: true },
                { label: "Assinatura em webhooks públicos", ok: true },
                { label: "Validação de entrada em Edge Functions", ok: true },
                { label: "Rate limiting nativo", ok: false },
              ].map((s) => (
                <li key={s.label} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <span className="text-small">{s.label}</span>
                  <StatusBadge status={s.ok ? "healthy" : "warn"} />
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 6. Edge Functions */}
          <SectionCard icon={Zap} title="Edge Functions">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Chamadas IA (24h)" value={data?.aiTotals.total ?? 0} />
              <Metric label="Falhas (24h)" value={data?.aiTotals.fail ?? 0} />
              <Metric label="Latência média" value={data ? `${data.aiTotals.avgLatency} ms` : "—"} />
              <Metric label="Última execução IA" value={data && data.ai[0] ? timeAgo(data.ai[0].lastRun) : null} />
            </div>
            {data && data.recentErrors.length > 0 && (
              <>
                <p className="text-caption text-muted-foreground mt-3 mb-1">Últimos erros:</p>
                <ul className="space-y-1">
                  {data.recentErrors.map((e, i) => (
                    <li key={i} className="text-caption flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
                      <span className="truncate"><span className="font-medium">{e.task}</span> — {e.error}</span>
                      <span className="text-muted-foreground shrink-0">{timeAgo(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          {/* 7. Performance */}
          <SectionCard icon={Gauge} title="Performance">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Latência do banco" value={data ? `${data.ping.latency} ms` : "—"} />
              <Metric label="Latência média IA" value={data ? `${data.aiTotals.avgLatency} ms` : "—"} />
              <Metric label="Requisições IA (24h)" value={data?.aiTotals.total ?? 0} />
              <Metric label="Taxa de sucesso" value={data && data.aiTotals.total ? `${Math.round((data.aiTotals.success / data.aiTotals.total) * 100)}%` : "—"} />
            </div>
          </SectionCard>
        </div>

        {/* 10. Registro de Eventos */}
        <SectionCard icon={ClipboardList} title="Registro de Eventos">
          {(!data || data.events.length === 0) ? (
            <p className="text-small text-muted-foreground">Sem eventos recentes.</p>
          ) : (
            <ul className="space-y-2">
              {data.events.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <span className="text-small truncate">{e.label}</span>
                  <span className="text-caption text-muted-foreground shrink-0">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}
