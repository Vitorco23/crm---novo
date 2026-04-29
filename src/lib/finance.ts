// ===== Finance store =====
// Tracks revenue (one-off sales + auto from won deals) and expenses (one-off + fixed monthly).

export type TransactionKind = "revenue" | "expense";
export type ExpenseCategory = "fixo" | "investimento" | "variavel" | "imposto" | "outro";

export interface FinanceTransaction {
  id: string;
  kind: TransactionKind;
  amount: number; // positive number, in BRL
  description: string;
  date: string; // YYYY-MM-DD
  category?: ExpenseCategory; // for expenses
  recurring?: boolean; // monthly recurring (fixo)
  clientId?: string; // lead.id when auto-created from onboarding
  clientName?: string;
  serviceType?: string;
  source: "manual" | "auto_onboarding";
  createdAt: string;
}

const TX_KEY = "p21_finance_tx";

function load<T>(k: string, fb: T): T {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
}
function save<T>(k: string, d: T) { localStorage.setItem(k, JSON.stringify(d)); }

export function getTransactions(): FinanceTransaction[] {
  return load<FinanceTransaction[]>(TX_KEY, []);
}

export function saveTransactions(t: FinanceTransaction[]) { save(TX_KEY, t); }

export function addTransaction(data: Omit<FinanceTransaction, "id" | "createdAt">): FinanceTransaction {
  const tx: FinanceTransaction = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const all = getTransactions();
  all.push(tx);
  saveTransactions(all);
  return tx;
}

export function updateTransaction(id: string, updates: Partial<FinanceTransaction>) {
  const all = getTransactions();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates };
  saveTransactions(all);
}

export function deleteTransaction(id: string) {
  saveTransactions(getTransactions().filter((t) => t.id !== id));
}

export function findTransactionByClient(clientId: string): FinanceTransaction | undefined {
  return getTransactions().find((t) => t.clientId === clientId && t.source === "auto_onboarding");
}

/** Creates or updates the auto onboarding revenue for a client. */
export function upsertOnboardingRevenue(params: {
  clientId: string;
  clientName: string;
  amount: number;
  serviceType?: string;
}): FinanceTransaction {
  const existing = findTransactionByClient(params.clientId);
  if (existing) {
    updateTransaction(existing.id, {
      amount: params.amount,
      clientName: params.clientName,
      serviceType: params.serviceType,
      description: `Contrato fechado — ${params.clientName}`,
    });
    return { ...existing, amount: params.amount, clientName: params.clientName, serviceType: params.serviceType };
  }
  return addTransaction({
    kind: "revenue",
    amount: params.amount,
    description: `Contrato fechado — ${params.clientName}`,
    date: new Date().toISOString().slice(0, 10),
    clientId: params.clientId,
    clientName: params.clientName,
    serviceType: params.serviceType,
    source: "auto_onboarding",
  });
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fixo: "Gasto Fixo",
  investimento: "Investimento",
  variavel: "Variável",
  imposto: "Imposto",
  outro: "Outro",
};

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}
