// Briefing Comercial — leitura consolidada de dados JÁ existentes.
// Fonte: Diagnóstico Automático (V1.1) + Observações Permanentes + Interações.
// NÃO chama IA. NÃO altera nenhum dado. Zero consultas novas.
import { User, Phone, ShieldAlert, Clock, Target, Flame, Thermometer, Snowflake, Sparkles, Timer } from "lucide-react";
import type { Lead } from "@/shared/services/store";
import { LeadIntelligenceRepository } from "@/modules/leads/services/LeadIntelligenceRepository";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const TEMP_ICON = { quente: Flame, morno: Thermometer, frio: Snowflake, novo: Sparkles } as const;
const TEMP_BAR = { quente: "bg-orange-500", morno: "bg-yellow-500", frio: "bg-sky-400", novo: "bg-muted-foreground/40" } as const;

// Estimativa de tempo por tipo de ação — deriva do texto já existente,
// sem chamar IA. Usada apenas como orientação visual.
function estimateMinutes(nextAction: string): number {
  const s = (nextAction || "").toLowerCase();
  if (/whats|mensagem/.test(s)) return 2;
  if (/liga|call|telefon/.test(s)) return 3;
  if (/proposta|enviar/.test(s)) return 5;
  if (/agendar|reuni/.test(s)) return 4;
  if (/document|anexo/.test(s)) return 4;
  if (/diagn[óo]stico/.test(s)) return 6;
  return 3;
}

function Divider() {
  return <div className="h-px bg-border/40 my-2" />;
}

function LastContactLabel({ lead }: { lead: Lead }) {
  const interLast = [...(lead.interactions || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const noteLast = [...(lead.callNotes || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const interAt = interLast ? new Date(interLast.date).getTime() : 0;
  const noteAt = noteLast ? new Date(noteLast.createdAt).getTime() : 0;
  if (!interAt && !noteAt) return <span className="text-muted-foreground/60">Sem contato registrado</span>;
  const date = interAt >= noteAt ? new Date(interAt) : new Date(noteAt);
  return <span>{formatDistanceToNow(date, { locale: ptBR, addSuffix: true })}</span>;
}

export default function LeadExecutiveSummary({ lead }: { lead: Lead }) {
  const s = LeadIntelligenceRepository.executiveSummary(lead);
  const temp = LeadIntelligenceRepository.temperature(lead);
  const nextAction = LeadIntelligenceRepository.nextAction(lead);
  const probability = Math.max(0, Math.min(100, Math.round(lead.autoDiagnosis?.probability || 0)));
  const hasProb = Boolean(lead.autoDiagnosis?.probability);
  const mins = estimateMinutes(nextAction);
  const TempIcon = TEMP_ICON[temp.key];

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <span aria-hidden>🧠</span> Briefing Comercial
        </p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Situação Atual</span>
      </div>

      {/* 1. Temperatura — protagonista */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${temp.cls}`}>
            <TempIcon className="h-4 w-4" />
            {temp.emoji} {temp.label}
          </div>
          {hasProb && (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{probability}%</span> chance de reunião
            </span>
          )}
        </div>
        {hasProb && (
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${TEMP_BAR[temp.key]} transition-all`} style={{ width: `${probability}%` }} />
          </div>
        )}
      </div>

      <Divider />

      {/* 2. Decisor */}
      <div className="flex items-start gap-2">
        <User className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Decisor</p>
          {s.decisor ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-foreground/90 font-medium">{s.decisor}</p>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                👤 Decisor identificado
              </Badge>
            </div>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30">
              ⚪ Decisor ainda não identificado
            </Badge>
          )}
        </div>
      </div>

      <Divider />

      {/* 3. Último contato */}
      <div className="flex items-start gap-2">
        <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">📞 Último contato</p>
          <p className="text-sm text-foreground/90"><LastContactLabel lead={lead} /></p>
          {s.ultimaLigacao && (
            <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{s.ultimaLigacao}"</p>
          )}
        </div>
      </div>

      <Divider />

      {/* 4. Maior objeção */}
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">🚧 Maior objeção</p>
          <p className={`text-sm ${s.maiorObjecao ? "text-foreground/90" : "text-muted-foreground/60"}`}>
            {s.maiorObjecao || "Nenhuma objeção registrada"}
          </p>
        </div>
      </div>

      {s.melhorHorario && (
        <>
          <Divider />
          <div className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">⏰ Melhor horário</p>
              <p className="text-sm text-foreground/90">{s.melhorHorario}</p>
            </div>
          </div>
        </>
      )}

      <Divider />

      {/* 5. Próxima Melhor Ação — MAIOR destaque */}
      <div className="rounded-md border border-accent/40 bg-accent/10 p-3 mt-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] uppercase tracking-wider text-accent font-semibold flex items-center gap-1">
            <Target className="h-3 w-3" /> 🎯 O que fazer agora
          </p>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Timer className="h-3 w-3" /> ~{mins} min
          </span>
        </div>
        <p className="text-base font-semibold text-foreground leading-snug">
          {nextAction}
        </p>
      </div>
    </div>
  );
}
