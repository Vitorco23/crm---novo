// Linha do Tempo Comercial resumida (ícones cronológicos).
// Apenas apresentação — nada de IA, nada de chamadas de rede.
import { Phone, MessageCircle, Mail, Users, FileText, MapPin, Handshake, CheckCircle2, Sparkles } from "lucide-react";
import type { TrailItem, TrailItemKind } from "@/lib/leadInsights";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ICONS: Record<TrailItemKind, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  proposal: FileText,
  visit: MapPin,
  followup: Handshake,
  sale: CheckCircle2,
  other: Sparkles,
};

const CLS: Record<TrailItemKind, string> = {
  call: "text-primary border-primary/40 bg-primary/10",
  whatsapp: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10",
  email: "text-sky-500 border-sky-500/40 bg-sky-500/10",
  meeting: "text-accent border-accent/40 bg-accent/10",
  proposal: "text-violet-500 border-violet-500/40 bg-violet-500/10",
  visit: "text-amber-500 border-amber-500/40 bg-amber-500/10",
  followup: "text-orange-500 border-orange-500/40 bg-orange-500/10",
  sale: "text-emerald-500 border-emerald-500/50 bg-emerald-500/15",
  other: "text-muted-foreground border-border bg-muted/40",
};

export default function LeadTrail({ items }: { items: TrailItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {items.map((it, idx) => {
        const Icon = ICONS[it.kind];
        const cls = CLS[it.kind];
        const dateStr = (() => { try { return format(new Date(it.at), "dd/MM 'às' HH:mm", { locale: ptBR }); } catch { return ""; } })();
        return (
          <div key={idx} className="flex items-center">
            <div
              title={`${it.label} · ${dateStr}`}
              className={`h-6 w-6 rounded-full border flex items-center justify-center ${cls}`}
            >
              <Icon className="h-3 w-3" />
            </div>
            {idx < items.length - 1 && <div className="w-3 h-px bg-border/60" />}
          </div>
        );
      })}
    </div>
  );
}
