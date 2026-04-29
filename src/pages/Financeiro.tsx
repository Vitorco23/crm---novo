import { useMemo, useState } from "react";
import {
  type FinanceTransaction, type ExpenseCategory,
  getTransactions, addTransaction, deleteTransaction,
  EXPENSE_CATEGORY_LABELS, formatBRL, monthKey,
} from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Trash2, Briefcase, Repeat, Wallet, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function Financeiro() {
  const [txs, setTxs] = useState<FinanceTransaction[]>(getTransactions);
  const [month, setMonth] = useState(currentMonthKey());
  const [revenueDialog, setRevenueDialog] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState(false);

  const refresh = () => setTxs(getTransactions());

  // For a given month, include: tx whose date is in the month + recurring expenses created on/before the month
  const monthTxs = useMemo(() => {
    return txs.filter((t) => {
      if (t.recurring && t.kind === "expense") {
        return monthKey(t.date) <= month;
      }
      return monthKey(t.date) === month;
    });
  }, [txs, month]);

  const revenue = monthTxs.filter((t) => t.kind === "revenue").reduce((s, t) => s + t.amount, 0);
  const expenses = monthTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  const profit = revenue - expenses;

  const handleDelete = (id: string) => {
    deleteTransaction(id);
    refresh();
    toast.success("Lançamento removido");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de entradas, saídas e investimentos da agência.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="capitalize text-sm px-3 py-1">{monthLabel(month)}</Badge>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Entradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{formatBRL(revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Saídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatBRL(expenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-accent" /> Lucro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${profit >= 0 ? "text-accent" : "text-destructive"}`}>
              {formatBRL(profit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <RevenueDialog open={revenueDialog} onOpenChange={setRevenueDialog} onSaved={refresh} />
        <ExpenseDialog open={expenseDialog} onOpenChange={setExpenseDialog} onSaved={refresh} />
      </div>

      {/* Lists */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">Tudo ({monthTxs.length})</TabsTrigger>
          <TabsTrigger value="revenue">Entradas</TabsTrigger>
          <TabsTrigger value="expense">Saídas</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <TxList items={monthTxs} onDelete={handleDelete} />
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <TxList items={monthTxs.filter((t) => t.kind === "revenue")} onDelete={handleDelete} />
        </TabsContent>
        <TabsContent value="expense" className="mt-4">
          <TxList items={monthTxs.filter((t) => t.kind === "expense")} onDelete={handleDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TxList({ items, onDelete }: { items: FinanceTransaction[]; onDelete: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhum lançamento neste mês.
        </CardContent>
      </Card>
    );
  }
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-2">
      {sorted.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 group">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${
              t.kind === "revenue" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
            }`}>
              {t.kind === "revenue" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-card-foreground truncate">{t.description}</p>
                {t.recurring && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    <Repeat className="h-2.5 w-2.5 mr-0.5" />Mensal
                  </Badge>
                )}
                {t.source === "auto_onboarding" && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">Auto</Badge>
                )}
                {t.category && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">{EXPENSE_CATEGORY_LABELS[t.category]}</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                {t.serviceType && ` • ${t.serviceType}`}
                {t.clientName && ` • ${t.clientName}`}
              </p>
            </div>
          </div>
          <p className={`text-sm font-bold tabular-nums ${t.kind === "revenue" ? "text-green-500" : "text-destructive"}`}>
            {t.kind === "revenue" ? "+" : "−"} {formatBRL(t.amount)}
          </p>
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition"
            onClick={() => onDelete(t.id)}
            disabled={t.source === "auto_onboarding"}
            title={t.source === "auto_onboarding" ? "Edite o valor do contrato no lead" : "Remover"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function RevenueDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceType, setServiceType] = useState("");

  const handleSave = () => {
    const n = Number(amount);
    if (!description.trim() || !n || n <= 0) {
      toast.error("Informe descrição e valor válido");
      return;
    }
    addTransaction({
      kind: "revenue",
      amount: n,
      description: description.trim(),
      date,
      serviceType: serviceType.trim() || undefined,
      source: "manual",
    });
    setDescription(""); setAmount(""); setServiceType("");
    onSaved();
    onOpenChange(false);
    toast.success("Entrada registrada");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-green-500/90 hover:bg-green-500 text-white">
          <Plus className="h-4 w-4 mr-1" /> Entrada (venda avulsa)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Entrada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Consultoria pontual" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Tipo de serviço (opcional)</Label>
            <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="Ex: Setup de tráfego" />
          </div>
        </div>
        <DialogFooter><Button onClick={handleSave}>Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>("variavel");
  const [recurring, setRecurring] = useState(false);

  const handleSave = () => {
    const n = Number(amount);
    if (!description.trim() || !n || n <= 0) {
      toast.error("Informe descrição e valor válido");
      return;
    }
    addTransaction({
      kind: "expense",
      amount: n,
      description: description.trim(),
      date,
      category,
      recurring: category === "fixo" ? true : recurring,
      source: "manual",
    });
    setDescription(""); setAmount(""); setCategory("variavel"); setRecurring(false);
    onSaved();
    onOpenChange(false);
    toast.success("Saída registrada");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
          <Plus className="h-4 w-4 mr-1" /> Saída / Despesa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Saída</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel, Anúncios..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Gasto Fixo (mensal)</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
                <SelectItem value="variavel">Variável</SelectItem>
                <SelectItem value="imposto">Imposto</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {category !== "fixo" && (
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <div>
                <Label className="text-sm">Recorrente mensal?</Label>
                <p className="text-[10px] text-muted-foreground">Aparecerá em todos os meses a partir desta data.</p>
              </div>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
          )}
          {category === "fixo" && (
            <p className="text-[11px] text-muted-foreground">Gastos fixos são automaticamente recorrentes mensalmente.</p>
          )}
        </div>
        <DialogFooter><Button onClick={handleSave}>Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
