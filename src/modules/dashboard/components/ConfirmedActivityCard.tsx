import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Phone, MessageCircle, Mail, RefreshCw, CalendarCheck } from "lucide-react";
import {
  summarizeActivity,
  CHANNEL_LABELS,
  SOURCE_LABELS,
  type ActivityChannel,
  type ActivitySource,
} from "@/shared/services/activityLedger";

const CHANNELS: Array<{ key: ActivityChannel; icon: typeof Phone; hue: number }> = [
  { key: "call", icon: Phone, hue: 78 },
  { key: "message", icon: MessageCircle, hue: 150 },
  { key: "email", icon: Mail, hue: 40 },
  { key: "followup", icon: RefreshCw, hue: 200 },
  { key: "meeting", icon: CalendarCheck, hue: 320 },
];

interface Props {
  from: Date;
  to: Date;
  periodLabel: string;
}

export default function ConfirmedActivityCard({ from, to, periodLabel }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("p21:storage-synced", bump);
    window.addEventListener("focus", bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("p21:storage-synced", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const summary = useMemo(
    () => summarizeActivity(from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, from.getTime(), to.getTime()]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          Atividades confirmadas — {periodLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary.total === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Dado não informado ou sem fonte confirmada.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {CHANNELS.map(({ key, icon: Icon, hue }) => (
                <div key={key} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                    <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${hue} 50% 55%)` }} />
                    <span className="truncate">{CHANNEL_LABELS[key]}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
                    {summary.confirmedByChannel[key]}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1">
              {CHANNELS.filter(({ key }) => summary.confirmedByChannel[key] > 0).map(({ key }) => {
                const sources = summary.bySource[key];
                const parts = (Object.keys(sources) as ActivitySource[])
                  .sort((a, b) => (sources[b] || 0) - (sources[a] || 0))
                  .map((s) => `${sources[s]} ${SOURCE_LABELS[s]}`);
                return (
                  <p key={key} className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {summary.confirmedByChannel[key]} {CHANNEL_LABELS[key].toLowerCase()}
                    </span>
                    {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
                  </p>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border">
              Total: <span className="font-medium text-foreground">{summary.totalConfirmed}</span> atividades
              confirmadas por fonte real (CallFace/Matteline, registro explícito e reuniões registradas).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
