// ============================================================================
// CAPACIDADE OPERACIONAL DO DIA
// Explica ao usuário por que a Missão do Dia não ocupa 100% da capacidade
// calculada na aba Metas: 80% é planejado, 20% é reserva estratégica.
// ============================================================================

import { Card, CardContent } from "@/components/ui/card";
import { Gauge, Users, Repeat, Shield } from "lucide-react";
import type { MissionPlan } from "@/modules/intelligence/services/missionPlanner";

function Metric({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <p className={`text-xl font-semibold tabular-nums ${accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function OperationalCapacityCard({ plan }: { plan: MissionPlan }) {
  const { capacity, distribution } = plan;
  if (!capacity || capacity.max <= 0) return null;

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge className="h-4 w-4 text-accent" /> Capacidade Operacional de Hoje
          </p>
          <p className="text-xs text-muted-foreground">
            Distribuição dinâmica entre prospecção ativa e follow-ups
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Metric
            icon={<Gauge className="h-3 w-3" />}
            label="Capacidade máxima"
            value={capacity.max}
            hint="Cenário ideal calculado na aba Metas"
          />
          <Metric
            icon={<Gauge className="h-3 w-3" />}
            label="Capacidade planejada (80%)"
            value={capacity.planned}
            hint="Contatos que a Missão do Dia planeja"
            accent
          />
          <Metric
            icon={<Shield className="h-3 w-3" />}
            label="Reserva estratégica (20%)"
            value={capacity.reserve}
            hint="Reuniões, deslocamentos e imprevistos"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Metric
            icon={<Users className="h-3 w-3" />}
            label="Novos leads"
            value={distribution?.newLeads ?? 0}
            hint="Prospecção ativa do dia"
          />
          <Metric
            icon={<Repeat className="h-3 w-3" />}
            label="Follow-ups"
            value={distribution?.followups ?? 0}
            hint="Retornos, urgências e cadência"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default OperationalCapacityCard;
