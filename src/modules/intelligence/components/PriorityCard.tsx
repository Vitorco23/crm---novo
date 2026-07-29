import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getLeads,
  getMeetings,
  getStagesForPipeline,
} from "@/shared/services/store";
import { getReminders } from "@/modules/agenda/services/reminders";
import {
  CalendarClock,
  CalendarCheck,
  FileText,
  FileSignature,
  Phone,
  Target,
  CheckCircle2,
} from "lucide-react";

type Priority = {
  icon: React.ReactNode;
  label: string;
  title: string;
  reason: string;
  cta?: { text: string; href?: string };
  tone: "urgent" | "warn" | "info" | "idle" | "none";
};

function toneClasses(tone: Priority["tone"]) {
  switch (tone) {
    case "urgent":
      return "border-l-4 border-l-[#f4c542] bg-gradient-to-r from-[#f4c542]/10 via-accent/5 to-transparent";
    case "warn":
      return "border-l-4 border-l-[#f4c542] bg-[#f4c542]/5";
    case "info":
      return "border-l-4 border-l-accent bg-accent/5";
    case "idle":
      return "border-l-4 border-l-accent/60 bg-accent/5";
    case "none":
    default:
      return "border-l-4 border-l-muted bg-muted/10";
  }
}

function computePriority(): Priority {
  const now = new Date();
  const leads = getLeads();
  const meetings = getMeetings();
  const reminders = getReminders();

  // 1) Reunião em menos de 30 minutos
  const upcoming = meetings
    .map((m) => ({ m, at: new Date(`${m.date}T${m.time || "00:00"}:00`) }))
    .filter(({ at }) => {
      const diff = at.getTime() - now.getTime();
      return diff >= 0 && diff <= 30 * 60_000;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  if (upcoming) {
    const { m, at } = upcoming;
    const mins = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60_000));
    const link = m.meetLink || m.link || m.googleEventUrl;
    return {
      icon: <CalendarClock className="h-5 w-5" />,
      label: "Reunião iminente",
      title: `Entrar na reunião com ${m.company}`,
      reason: `Reunião começa em ${mins} min (${m.time}).`,
      cta: link ? { text: "Abrir sala", href: link } : undefined,
      tone: "urgent",
    };
  }

  // 2) Reunião hoje sem confirmação
  const todayStr = now.toISOString().slice(0, 10);
  const confirmedIds = new Set(
    reminders
      .filter((r) => r.status === "sent" && r.meetingId)
      .map((r) => r.meetingId as string)
  );
  const unconfirmed = meetings
    .filter((m) => m.date === todayStr)
    .filter((m) => new Date(`${m.date}T${m.time}:00`).getTime() > now.getTime())
    .filter((m) => !confirmedIds.has(m.id))
    .sort((a, b) => a.time.localeCompare(b.time))[0];

  if (unconfirmed) {
    return {
      icon: <CalendarCheck className="h-5 w-5" />,
      label: "Confirmar reunião",
      title: `Confirmar reunião da ${unconfirmed.company}`,
      reason: `Reunião marcada para hoje às ${unconfirmed.time} e ainda não foi confirmada com o lead.`,
      tone: "warn",
    };
  }

  // 3) Lead em "Documento de Guerra" (Diagnóstico em Construção) — mais antigo
  const dgLead = leads
    .filter((l) => l.stage === "Documento de Guerra")
    .sort(
      (a, b) =>
        new Date(a.stageChangedAt).getTime() - new Date(b.stageChangedAt).getTime()
    )[0];
  if (dgLead) {
    const days = Math.max(
      0,
      Math.floor((now.getTime() - new Date(dgLead.stageChangedAt).getTime()) / 86_400_000)
    );
    return {
      icon: <FileText className="h-5 w-5" />,
      label: "Diagnóstico em Construção",
      title: `Construir diagnóstico para ${dgLead.company}`,
      reason:
        days > 0
          ? `Lead está há ${days} dia(s) na etapa "Documento de Guerra" aguardando o diagnóstico.`
          : `Lead entrou hoje na etapa "Documento de Guerra" e precisa do diagnóstico.`,
      tone: "info",
    };
  }

  // 4) Proposta enviada aguardando retorno (>2 dias sem movimento)
  const proposta = leads
    .filter((l) => l.stage === "Proposta Enviada")
    .map((l) => ({
      l,
      days: Math.floor(
        (now.getTime() - new Date(l.stageChangedAt).getTime()) / 86_400_000
      ),
    }))
    .filter(({ days }) => days >= 2)
    .sort((a, b) => b.days - a.days)[0];
  if (proposta) {
    return {
      icon: <FileSignature className="h-5 w-5" />,
      label: "Proposta pendente",
      title: `Follow-up de proposta com ${proposta.l.company}`,
      reason: `Proposta enviada há ${proposta.days} dia(s) sem retorno registrado.`,
      tone: "info",
    };
  }

  // 5) Follow-up vencido
  const overdue = reminders
    .filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() < now.getTime())
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  if (overdue) {
    const lead = leads.find((l) => l.id === overdue.leadId);
    const hoursLate = Math.max(
      1,
      Math.round((now.getTime() - new Date(overdue.scheduledFor).getTime()) / 3_600_000)
    );
    return {
      icon: <Phone className="h-5 w-5" />,
      label: "Follow-up vencido",
      title: `Fazer follow-up com ${lead?.company || overdue.title}`,
      reason: `Lembrete "${overdue.title}" venceu há ${hoursLate}h e ainda está pendente.`,
      tone: "warn",
    };
  }

  // 6) Campanha de prospecção ativa
  // Regra objetiva: par (cidade, nicho) que já teve leads contatados E ainda tem leads em "Novo Lead".
  // Escolhe a campanha com maior progresso (mais leads já trabalhados) — quem está mais avançado
  // deve ser finalizado antes de iniciar outro. Empate: maior volume total.
  const coldStagesSet = new Set(getStagesForPipeline("cold_call"));
  const coldLeads = leads.filter((l) => coldStagesSet.has(l.stage));
  const perCampaign = new Map<
    string,
    { city: string; niche: string; contacted: number; pending: number }
  >();
  for (const l of coldLeads) {
    const city = (l.city || "").trim();
    const niche = (l.niche || "").trim();
    if (!city || !niche) continue;
    const key = `${city}||${niche}`;
    const entry =
      perCampaign.get(key) || { city, niche, contacted: 0, pending: 0 };
    if (l.stage === "Novo Lead") entry.pending += 1;
    else entry.contacted += 1;
    perCampaign.set(key, entry);
  }
  const activeCampaigns = [...perCampaign.values()]
    .filter((c) => c.contacted > 0 && c.pending > 0)
    .sort((a, b) => {
      if (b.contacted !== a.contacted) return b.contacted - a.contacted;
      return b.contacted + b.pending - (a.contacted + a.pending);
    });

  if (activeCampaigns.length > 0) {
    const c = activeCampaigns[0];
    const total = c.contacted + c.pending;
    return {
      icon: <Target className="h-5 w-5" />,
      label: "Campanha ativa",
      title: `Continuar campanha "${c.niche} - ${c.city}"`,
      reason: `Campanha em andamento com ${c.contacted} de ${total} leads já trabalhados (${c.pending} restantes).`,
      tone: "idle",
    };
  }

  // Nenhuma prioridade
  return {
    icon: <CheckCircle2 className="h-5 w-5" />,
    label: "Sem prioridades",
    title: "Nenhuma prioridade operacional no momento.",
    reason:
      "Não há reuniões próximas, diagnósticos pendentes, propostas em atraso, follow-ups vencidos ou campanhas ativas em andamento.",
    tone: "none",
  };
}

export default function PriorityCard() {
  const p = useMemo(() => computePriority(), []);
  return (
    <Card className={`overflow-hidden ${toneClasses(p.tone)}`}>
      <CardContent className="py-4 px-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
          {p.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Prioridade do Momento · {p.label}
          </p>
          <p className="text-base font-semibold text-foreground truncate">{p.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground/80">Motivo: </span>
            {p.reason}
          </p>
        </div>
        {p.cta?.href && (
          <a href={p.cta.href} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
              {p.cta.text}
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
