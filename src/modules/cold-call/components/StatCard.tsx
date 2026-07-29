import { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  goal?: string | number;
  percent?: number; // 0-100
  hint?: string;
  tone?: "default" | "accent" | "warning" | "danger";
}

function toneClasses(tone: StatCardProps["tone"]) {
  switch (tone) {
    case "accent":
      return "border-accent/40";
    case "warning":
      return "border-yellow-500/40";
    case "danger":
      return "border-destructive/40";
    default:
      return "border-border";
  }
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-accent";
  if (pct >= 66) return "bg-accent/80";
  if (pct >= 33) return "bg-yellow-500";
  return "bg-destructive/80";
}

export default function StatCard({ icon, label, value, goal, percent, hint, tone }: StatCardProps) {
  const pct = typeof percent === "number" ? Math.min(200, Math.max(0, percent)) : null;
  return (
    <div className={`rounded-lg border ${toneClasses(tone)} bg-card p-3 min-w-[140px] flex flex-col gap-1.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        <span className="text-accent">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-card-foreground leading-none">{value}</span>
        {goal !== undefined && (
          <span className="text-xs text-muted-foreground">/ {goal}</span>
        )}
      </div>
      {pct !== null && (
        <>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor(pct)} transition-all`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(pct)}%</span>
            {hint && <span>{hint}</span>}
          </div>
        </>
      )}
      {pct === null && hint && (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
