import { useEffect, useState } from "react";
import { getTransactions, formatBRL, monthKey } from "@/lib/finance";
import { getGoalsSettings } from "@/lib/store";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

function currentMonthRevenue(): number {
  const m = new Date().toISOString().slice(0, 7);
  return getTransactions()
    .filter((t) => t.kind === "revenue" && monthKey(t.date) === m)
    .reduce((s, t) => s + t.amount, 0);
}

export function HeaderStatsWidget() {
  const [revenue, setRevenue] = useState<number>(() => currentMonthRevenue());
  const [goal, setGoal] = useState<number>(() => getGoalsSettings().monthlyRevenueGoal);

  useEffect(() => {
    const refresh = () => {
      setRevenue(currentMonthRevenue());
      setGoal(getGoalsSettings().monthlyRevenueGoal);
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    const id = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(id);
    };
  }, []);

  const pct = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1.5 min-w-[200px]">
        <Trophy className="h-4 w-4 text-accent shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-xs font-bold text-accent tabular-nums">{formatBRL(revenue)}</span>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">/ {formatBRL(goal)}</span>
          </div>
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all", pct >= 100 ? "bg-green-500" : "bg-accent")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
