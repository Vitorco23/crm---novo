// Resumo Executivo — leitura consolidada de dados JÁ existentes.
// Fonte: Diagnóstico Automático (V1.1) + Observações Permanentes + Interações.
// NÃO chama IA. NÃO altera nenhum dado.
import { User, Phone, ShieldAlert, Clock, ArrowRightCircle } from "lucide-react";
import type { Lead } from "@/lib/store";
import { executiveSummary } from "@/lib/leadInsights";

const EMPTY_HINT = "—";

function Row({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className={`mt-0.5 shrink-0 ${highlight ? "text-accent" : "text-muted-foreground"}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-sm ${value ? "text-foreground/90" : "text-muted-foreground/60"} ${highlight ? "font-medium" : ""} break-words`}>
          {value || EMPTY_HINT}
        </p>
      </div>
    </div>
  );
}

export default function LeadExecutiveSummary({ lead }: { lead: Lead }) {
  const s = executiveSummary(lead);
  const hasAnything = Boolean(s.decisor || s.ultimaLigacao || s.maiorObjecao || s.melhorHorario || s.proximaAcao);
  if (!hasAnything) return null;

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Resumo Comercial</p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Dados consolidados</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Row icon={<User className="h-3.5 w-3.5" />} label="Decisor" value={s.decisor} />
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="Melhor horário" value={s.melhorHorario} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Última ligação" value={s.ultimaLigacao} />
        <Row icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Maior objeção" value={s.maiorObjecao} />
        <div className="md:col-span-2">
          <Row icon={<ArrowRightCircle className="h-4 w-4" />} label="Próxima ação" value={s.proximaAcao} highlight />
        </div>
      </div>
    </div>
  );
}
