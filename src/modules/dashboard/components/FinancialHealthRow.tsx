import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Target, TrendingUp } from "lucide-react";
import { formatBRL } from "@/modules/financeiro/services/finance";

interface FinancialHealthRowProps {
  revenue: number;
  goal: number;
}

const FinancialHealthRow = ({ revenue, goal }: FinancialHealthRowProps) => {
  const percentage = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;
  const remaining = Math.max(0, goal - revenue);

  return (
    <Card className="border-border/40 bg-card/50 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                <Target className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest">Saúde Financeira do Mês</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black">{formatBRL(revenue)}</span>
              <span className="text-xs text-muted-foreground font-medium">de {formatBRL(goal)}</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
              <span className="text-muted-foreground">Progresso da Meta</span>
              <span className="text-accent">{percentage.toFixed(1)}%</span>
            </div>
            <Progress value={percentage} className="h-2 bg-muted" />
            {remaining > 0 && (
              <p className="text-[10px] text-muted-foreground font-medium italic">
                Faltam {formatBRL(remaining)} para atingir a meta
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 border-l border-border/20 pl-4 hidden md:flex">
             <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground uppercase">Status</p>
                <div className="mt-1">
                   {percentage >= 100 ? (
                     <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">META BATIDA</span>
                   ) : percentage >= 70 ? (
                     <span className="text-[10px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-full">NO RITMO</span>
                   ) : (
                     <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">EM RISCO</span>
                   )}
                </div>
             </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FinancialHealthRow;
