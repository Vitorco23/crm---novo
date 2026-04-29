import { useEffect, useMemo, useState } from "react";
import {
  type DailyTask,
  getDailyTasks, addDailyTask, removeDailyTask,
  getTodayChecks, toggleTodayCheck,
} from "@/lib/dailyTasks";
import { getTransactions, formatBRL, monthKey } from "@/lib/finance";
import { getGoalsSettings } from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, ClipboardList, Plus, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

function currentMonthRevenue(): number {
  const m = new Date().toISOString().slice(0, 7);
  return getTransactions()
    .filter((t) => t.kind === "revenue" && monthKey(t.date) === m)
    .reduce((s, t) => s + t.amount, 0);
}

export function HeaderStatsWidget() {
  const [tasks, setTasks] = useState<DailyTask[]>(() => getDailyTasks());
  const [done, setDone] = useState<string[]>(() => getTodayChecks());
  const [revenue, setRevenue] = useState<number>(() => currentMonthRevenue());
  const [goal, setGoal] = useState<number>(() => getGoalsSettings().monthlyRevenueGoal);
  const [newTitle, setNewTitle] = useState("");
  const [open, setOpen] = useState(false);

  const refreshAll = () => {
    setTasks(getDailyTasks());
    setDone(getTodayChecks());
    setRevenue(currentMonthRevenue());
    setGoal(getGoalsSettings().monthlyRevenueGoal);
  };

  // Refresh on storage changes (other tabs) + on focus + every 30s + when popover opens
  useEffect(() => {
    const onStorage = () => refreshAll();
    const onFocus = () => refreshAll();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    const id = setInterval(refreshAll, 30000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, []);

  useEffect(() => { if (open) refreshAll(); }, [open]);

  const pct = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;
  const doneCount = useMemo(() => done.filter((id) => tasks.some((t) => t.id === id)).length, [done, tasks]);

  const handleToggle = (id: string) => {
    toggleTodayCheck(id);
    setDone(getTodayChecks());
  };
  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addDailyTask(newTitle);
    setNewTitle("");
    setTasks(getDailyTasks());
  };
  const handleRemove = (id: string) => {
    removeDailyTask(id);
    setTasks(getDailyTasks());
    setDone(getTodayChecks());
  };

  return (
    <div className="flex items-center gap-2">
      {/* Goal progress pill */}
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

      {/* Daily tasks popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <ClipboardList className="h-4 w-4" />
            {tasks.length > 0 && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
                  doneCount === tasks.length
                    ? "bg-green-500 text-white"
                    : "bg-destructive text-destructive-foreground"
                )}
              >
                {tasks.length - doneCount > 0 ? tasks.length - doneCount : <Check className="h-2.5 w-2.5" />}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <p className="text-sm font-semibold">Tarefas Diárias</p>
            <span className="text-xs text-muted-foreground tabular-nums">{doneCount}/{tasks.length}</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            {tasks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">
                Adicione tarefas que você quer fazer todos os dias.
              </p>
            )}
            {tasks.map((t) => {
              const isDone = done.includes(t.id);
              return (
                <div key={t.id} className="group flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40">
                  <button
                    onClick={() => handleToggle(t.id)}
                    className={cn(
                      "h-4 w-4 rounded-full border-2 flex items-center justify-center transition shrink-0",
                      isDone ? "bg-green-500 border-green-500" : "border-destructive/70 hover:border-destructive"
                    )}
                    aria-label={isDone ? "Desmarcar" : "Marcar como feito"}
                  >
                    {isDone && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </button>
                  <span
                    className={cn(
                      "text-sm flex-1 truncate",
                      isDone ? "line-through text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {t.title}
                  </span>
                  <button
                    onClick={() => handleRemove(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-2.5 border-t">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Nova tarefa diária..."
              className="h-8 text-xs"
            />
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
