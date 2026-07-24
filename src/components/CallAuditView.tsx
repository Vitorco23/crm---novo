import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { CallAuditData, Lead } from "@/lib/store";
import NextBestActionCard from "@/components/NextBestActionCard";
import {
  Target, MessageSquare, AlertTriangle, CheckCircle2, TrendingUp,
  UserCheck, CalendarClock, Lightbulb, TrendingDown, ArrowRight, History,
} from "lucide-react";

interface Props {
  data: CallAuditData;
  lead?: Lead;
  onRunDiagnosis?: () => void;
}

const trendStyle = (t?: string) =>
  t === "Evoluindo"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : t === "Esfriando"
    ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-muted text-muted-foreground border-border/50";

const TrendIcon = ({ t }: { t?: string }) =>
  t === "Evoluindo" ? <TrendingUp className="h-3.5 w-3.5" />
  : t === "Esfriando" ? <TrendingDown className="h-3.5 w-3.5" />
  : <ArrowRight className="h-3.5 w-3.5" />;

const trendLabel = (t?: string) =>
  t === "Evoluindo" ? "📈 Evoluindo" : t === "Esfriando" ? "📉 Esfriando" : "➡ Estável";

const tempStyle = (t: string) =>
  t === "Quente"
    ? "bg-orange-500/15 text-orange-400 border-orange-500/40"
    : t === "Frio"
    ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
    : "bg-amber-500/15 text-amber-400 border-amber-500/40";

const tempIcon = (t: string) => (t === "Quente" ? "🟢" : t === "Frio" ? "🔴" : "🟡");

const levelStyle = (l: string) =>
  l === "Alta"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : l === "Baixa"
    ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-amber-500/15 text-amber-400 border-amber-500/40";

const scoreColor = (n: number) =>
  n >= 70 ? "text-emerald-400" : n >= 40 ? "text-amber-400" : "text-red-400";

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function Bullets({ items, tone = "default" }: { items: string[]; tone?: "positive" | "negative" | "attention" | "default" }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground/70">—</p>;
  const dot =
    tone === "positive" ? "text-emerald-400"
    : tone === "negative" ? "text-red-400"
    : tone === "attention" ? "text-amber-400"
    : "text-primary";
  return (
    <ul className="space-y-1">
      {items.slice(0, 3).map((s, i) => (
        <li key={i} className="flex gap-2 leading-snug">
          <span className={`${dot} shrink-0`}>•</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function CallAuditView({ data }: Props) {
  return (
    <div className="space-y-3">
      {/* Veredito */}
      <div className="rounded-lg border border-border/50 bg-gradient-to-br from-background/80 to-muted/30 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Veredito
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Temperatura</div>
            <Badge variant="outline" className={`mt-1 text-xs ${tempStyle(data.temperatura)}`}>
              {tempIcon(data.temperatura)} {data.temperatura}
            </Badge>
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Score Comercial</div>
            <div className={`text-2xl font-bold leading-tight ${scoreColor(data.scoreComercial)}`}>
              {data.scoreComercial}<span className="text-xs text-muted-foreground">/100</span>
            </div>
            <Progress value={data.scoreComercial} className="h-1 mt-1" />
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Probabilidade</div>
            <Badge variant="outline" className={`mt-1 text-xs ${levelStyle(data.probabilidadeAvanco)}`}>
              {data.probabilidadeAvanco}
            </Badge>
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Prioridade</div>
            <Badge variant="outline" className={`mt-1 text-xs ${levelStyle(data.prioridade)}`}>
              {data.prioridade}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tendência do Lead */}
      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Tendência do Lead
        </div>
        <div className="flex items-start gap-2">
          <Badge variant="outline" className={`text-xs shrink-0 ${trendStyle(data.tendencia)}`}>
            <TrendIcon t={data.tendencia} />
            <span className="ml-1">{trendLabel(data.tendencia)}</span>
          </Badge>
          {data.tendenciaJustificativa && (
            <p className="text-sm text-foreground leading-snug">{data.tendenciaJustificativa}</p>
          )}
        </div>
      </div>

      {/* Resumo Executivo */}
      <Section icon={<MessageSquare className="h-3.5 w-3.5" />} title="💬 Resumo Executivo">
        <p className="whitespace-pre-wrap leading-snug">{data.resumoExecutivo}</p>
      </Section>

      {data.evolucaoLead && (
        <Section icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />} title="📊 Evolução do Lead">
          <p className="whitespace-pre-wrap leading-snug">{data.evolucaoLead}</p>
        </Section>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Section icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />} title="🚧 Objeções">
          <Bullets items={data.objecoes} tone="negative" />
        </Section>
        <Section icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />} title="✅ Pontos Positivos">
          <Bullets items={data.pontosPositivos} tone="positive" />
        </Section>
        <Section icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />} title="⚠ Pontos de Atenção">
          <Bullets items={data.pontosAtencao} tone="attention" />
        </Section>
        <Section icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />} title="🎯 Oportunidade Comercial">
          <Bullets items={data.oportunidadeComercial} />
        </Section>
      </div>

      <Section icon={<UserCheck className="h-3.5 w-3.5" />} title="👨‍💼 Feedback para o Vendedor">
        <p className="whitespace-pre-wrap leading-snug">{data.feedbackVendedor}</p>
      </Section>

      <Section icon={<CalendarClock className="h-3.5 w-3.5" />} title="📅 Plano de Follow-up">
        {data.planoFollowup?.length ? (
          <ul className="space-y-1.5">
            {data.planoFollowup.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0 min-w-[70px] justify-center">
                  {p.quando}
                </Badge>
                <span className="leading-snug">{p.acao}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground/70">—</p>}
        {data.dataProximoContato && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            Próximo contato sugerido: <span className="text-foreground font-medium">{data.dataProximoContato}</span>
            {typeof data.diasAteProximoFollowup === "number" && ` (em ${data.diasAteProximoFollowup} dia${data.diasAteProximoFollowup === 1 ? "" : "s"})`}
          </div>
        )}
      </Section>

      <Section icon={<Lightbulb className="h-3.5 w-3.5 text-amber-400" />} title="💡 Recomendação Estratégica">
        <p className="whitespace-pre-wrap leading-snug">{data.recomendacaoEstrategica}</p>
      </Section>

      {data.assuntosDeInteresse?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {data.assuntosDeInteresse.map((t, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
