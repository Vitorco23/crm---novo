import { useState, useMemo } from "react";
import {
  getGoalsSettings, saveGoalsSettings, type GoalsSettings,
  getSessions, getMovementEvents,
} from "@/shared/services/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Target, DollarSign, TrendingUp, Phone, UserCheck, CalendarCheck,
  Trophy, Calendar, Clock, Percent, Activity,
} from "lucide-react";
import { isToday } from "date-fns";
import ExportExcelDialog from "@/modules/pipeline/components/ExportExcelDialog";
import { buildMetasSheets } from "@/modules/pipeline/services/exportBuilders";
import RealConversionPanel from "@/modules/metas/components/RealConversionPanel";

const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.ceil(n));
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

function InputNum({
  label, value, onChange, suffix, step = 1, min = 0,
}: {
  label: string; value: number; onChange: (n: number) => void;
  suffix?: string; step?: number; min?: number;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number" value={Number.isFinite(value) ? value : ""} step={step} min={min}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? 0 : parseFloat(v));
          }}
          className={suffix ? "pr-10" : ""}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <div className={`rounded-md border p-3 ${accent ? "border-accent/40 bg-accent/5" : "bg-card"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Metas() {
  const [g, setG] = useState<GoalsSettings>(() => getGoalsSettings());

  const update = <K extends keyof GoalsSettings>(key: K, value: number) => {
    const next = { ...g, [key]: isNaN(value) ? 0 : value };
    setG(next);
    saveGoalsSettings(next);
  };

  const calc = useMemo(() => {
    const closes = g.averageTicket > 0 ? g.monthlyRevenueGoal / g.averageTicket : 0;

    const r = (n: number) => Math.max(n, 0.0001) / 100;
    const meetingsHeld = closes / r(g.meetingHeldToClose);
    const meetingsScheduled = meetingsHeld / r(g.meetingScheduledToHeld);
    const decisionMakers = meetingsScheduled / r(g.decisionMakerToMeetingScheduled);
    const connections = decisionMakers / r(g.connectionToDecisionMaker);
    const calls = connections / r(g.callToConnection);

    const workingDaysPerMonth = g.workingDaysPerWeek * 4.33;
    const callsPerDay = workingDaysPerMonth > 0 ? calls / workingDaysPerMonth : 0;
    const decisionMakersPerDay = workingDaysPerMonth > 0 ? decisionMakers / workingDaysPerMonth : 0;
    const meetingsPerDay = workingDaysPerMonth > 0 ? meetingsScheduled / workingDaysPerMonth : 0;

    const callsPossiblePerDay =
      g.minutesPerCall > 0 ? (g.hoursPerDay * 60) / g.minutesPerCall : 0;
    const feasible = callsPossiblePerDay > 0 ? callsPerDay / callsPossiblePerDay : 0;

    return {
      closes, meetingsHeld, meetingsScheduled, decisionMakers, connections, calls,
      callsPerDay, decisionMakersPerDay, meetingsPerDay,
      callsPossiblePerDay, feasible, workingDaysPerMonth,
    };
  }, [g]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div>
          </div>
        </div>
        <ExportExcelDialog moduleName="Metas" moduleSlug="Metas" build={buildMetasSheets} />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Inputs */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-accent" /> Meta Financeira
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <InputNum label="Meta Mensal (R$)" value={g.monthlyRevenueGoal}
                onChange={(n) => update("monthlyRevenueGoal", n)} step={500} suffix="R$" />
              <InputNum label="Ticket Médio (R$)" value={g.averageTicket}
                onChange={(n) => update("averageTicket", n)} step={100} suffix="R$" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Percent className="h-4 w-4 text-accent" /> Taxas de Conversão
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputNum label="Ligação → Conexão" value={g.callToConnection}
                onChange={(n) => update("callToConnection", n)} suffix="%" />
              <InputNum label="Conexão → Decisor" value={g.connectionToDecisionMaker}
                onChange={(n) => update("connectionToDecisionMaker", n)} suffix="%" />
              <InputNum label="Decisor → Reunião Marcada" value={g.decisionMakerToMeetingScheduled}
                onChange={(n) => update("decisionMakerToMeetingScheduled", n)} suffix="%" />
              <InputNum label="Marcada → Realizada" value={g.meetingScheduledToHeld}
                onChange={(n) => update("meetingScheduledToHeld", n)} suffix="%" />
              <InputNum label="Realizada → Fechamento" value={g.meetingHeldToClose}
                onChange={(n) => update("meetingHeldToClose", n)} suffix="%" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-accent" /> Gestão de Tempo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InputNum label="Dias/semana" value={g.workingDaysPerWeek}
                onChange={(n) => update("workingDaysPerWeek", n)} min={1} />
              <InputNum label="Horas/dia" value={g.hoursPerDay}
                onChange={(n) => update("hoursPerDay", n)} step={0.5} min={0.5} suffix="h" />
              <InputNum label="Min/ligação" value={g.minutesPerCall}
                onChange={(n) => update("minutesPerCall", n)} step={0.5} min={0.5} suffix="min" />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Outputs */}
        <div className="space-y-4">
          {/* Real conversion rates from CRM data */}
          <RealConversionPanel
            estimates={{
              callToConnection: g.callToConnection,
              connectionToDecisionMaker: g.connectionToDecisionMaker,
              decisionMakerToMeetingScheduled: g.decisionMakerToMeetingScheduled,
              meetingScheduledToHeld: g.meetingScheduledToHeld,
              meetingHeldToClose: g.meetingHeldToClose,
            }}
            onApplyReal={(rates) => {
              const next = { ...g, ...rates } as GoalsSettings;
              setG(next);
              saveGoalsSettings(next);
            }}
          />

          {/* Today's progress */}
          <TodayProgress
            callsGoal={calc.callsPerDay}
            decisionMakersGoal={calc.decisionMakersPerDay}
            meetingsGoal={calc.meetingsPerDay}
          />


          {/* Daily */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-accent" /> Metas Diárias
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              <Stat icon={Phone} label="Ligações/dia" value={fmtNum(calc.callsPerDay)} accent />
              <Stat icon={UserCheck} label="Decisores/dia" value={fmtNum(calc.decisionMakersPerDay)} />
              <Stat icon={CalendarCheck} label="Reuniões/dia" value={fmtNum(calc.meetingsPerDay)} />
            </CardContent>
          </Card>

          {/* Monthly */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-accent" /> Metas Mensais
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Stat icon={Phone} label="Ligações totais" value={fmtNum(calc.calls)} />
              <Stat icon={UserCheck} label="Decisores totais" value={fmtNum(calc.decisionMakers)} />
              <Stat icon={CalendarCheck} label="Reuniões totais" value={fmtNum(calc.meetingsScheduled)}
                sub={`${fmtNum(calc.meetingsHeld)} realizadas`} />
              <Stat icon={Trophy} label="Fechamentos" value={fmtNum(calc.closes)}
                sub={fmtMoney(g.monthlyRevenueGoal)} accent />
            </CardContent>
          </Card>

          {/* Golden numbers */}
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-accent" /> Números de Ouro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <FunnelLine label="Ligação → Conexão" pct={g.callToConnection} />
                <FunnelLine label="Conexão → Decisor" pct={g.connectionToDecisionMaker} />
                <FunnelLine label="Decisor → Reunião Marcada" pct={g.decisionMakerToMeetingScheduled} />
                <FunnelLine label="Reunião Marcada → Realizada" pct={g.meetingScheduledToHeld} />
                <FunnelLine label="Reunião Realizada → Fechamento" pct={g.meetingHeldToClose} />
              </div>
            </CardContent>
          </Card>

          {/* Feasibility */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-accent mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    Capacidade: <span className="font-medium text-foreground">
                      {fmtNum(calc.callsPossiblePerDay)} ligações/dia possíveis
                    </span>{" "}
                    ({g.hoursPerDay}h × 60 / {g.minutesPerCall}min)
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          calc.feasible <= 1 ? "bg-accent" : "bg-destructive"
                        }`}
                        style={{ width: `${Math.min(calc.feasible * 100, 100)}%` }}
                      />
                    </div>
                    <Badge
                      className={`text-[10px] ${
                        calc.feasible <= 1
                          ? "bg-accent/20 text-accent border-accent/40"
                          : "bg-destructive/20 text-destructive border-destructive/40"
                      }`}
                      variant="outline"
                    >
                      {Math.round(calc.feasible * 100)}% da capacidade
                    </Badge>
                  </div>
                  {calc.feasible > 1 && (
                    <p className="text-[10px] text-destructive mt-1">
                      ⚠ Meta acima da capacidade. Aumente horas/dia ou taxas de conversão.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FunnelLine({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-52 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-12 text-right font-bold text-accent">{pct}%</span>
    </div>
  );
}

function TodayProgress({
  callsGoal, decisionMakersGoal, meetingsGoal,
}: { callsGoal: number; decisionMakersGoal: number; meetingsGoal: number }) {
  // Fonte única da verdade: somente o que foi registrado no Pomodoro
  // (contadores flutuantes + formulário final da sessão). Movimentações
  // de card NÃO são contabilizadas para evitar duplicação.
  const today = useMemo(() => {
    const sessions = getSessions().filter((s) => isToday(new Date(s.startTime)));
    return {
      calls: sessions.reduce((a, s) => a + (s.calls || 0), 0),
      decisionMakers: sessions.reduce((a, s) => a + (s.decisionMakers || 0), 0),
      meetings: sessions.reduce((a, s) => a + (s.meetings || 0), 0),
    };
  }, []);

  const rows = [
    { icon: Phone, label: "Ligações hoje", real: today.calls, goal: Math.ceil(callsGoal) },
    { icon: UserCheck, label: "Decisores hoje", real: today.decisionMakers, goal: Math.ceil(decisionMakersGoal) },
    { icon: CalendarCheck, label: "Reuniões hoje", real: today.meetings, goal: Math.ceil(meetingsGoal) },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-accent" /> Progresso de Hoje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => {
          const pct = r.goal > 0 ? Math.min((r.real / r.goal) * 100, 100) : 0;
          const barColor =
            pct < 30 ? "bg-destructive" : pct < 70 ? "bg-yellow-500" : "bg-accent";
          const Icon = r.icon;
          return (
            <div key={r.label} className="flex items-center gap-2 text-xs">
              <span className="w-36 flex items-center gap-1.5 text-muted-foreground truncate">
                <Icon className="h-3.5 w-3.5" /> {r.label}
              </span>
              <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-20 text-right font-bold text-foreground tabular-nums">
                {r.real} <span className="text-muted-foreground font-normal">/ {r.goal}</span>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
