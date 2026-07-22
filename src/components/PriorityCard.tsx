import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getLeads,
  getMeetings,
  getStagesForPipeline,
} from "@/lib/store";
import { getReminders } from "@/lib/reminders";
import { CalendarClock, CalendarCheck, FileText, FileSignature, Phone, Target } from "lucide-react";

type Priority = {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle?: string;
  action: string;
  cta?: { text: string; href?: string; onClick?: () => void };
  tone: "urgent" | "warn" | "info" | "idle";
};

function toneClasses(tone: Priority["tone"]) {
  // green/yellow highlight, premium look
  switch (tone) {
    case "urgent":
      return "border-l-4 border-l-[#f4c542] bg-gradient-to-r from-[#f4c542]/10 via-accent/5 to-transparent";
    case "warn":
      return "border-l-4 border-l-[#f4c542] bg-[#f4c542]/5";
    case "info":
      return "border-l-4 border-l-accent bg-accent/5";
    case "idle":
    default:
      return "border-l-4 border-l-accent/60 bg-accent/5";
  }
}

function computePriority(): Priority {
  const now = new Date();
  const leads = getLeads();
  const meetings = getMeetings();

  // 1️⃣ Meeting starting within 30 minutes
  const upcomingMeeting = meetings
    .map((m) => ({ m, at: new Date(`${m.date}T${m.time || "00:00"}:00`) }))
    .filter(({ at }) => {
      const diff = at.getTime() - now.getTime();
      return diff >= 0 && diff <= 30 * 60_000;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  if (upcomingMeeting) {
    const { m } = upcomingMeeting;
    const link = m.meetLink || m.link || m.googleEventUrl;
    return {
      icon: <CalendarClock className="h-5 w-5" />,
      label: "Reunião em breve",
      title: m.company,
      subtitle: `Horário: ${m.time}${m.contactName ? ` · ${m.contactName}` : ""}`,
      action: "Envie o link e confirme a presença.",
      cta: link ? { text: "Abrir sala", href: link } : undefined,
      tone: "urgent",
    };
  }

  // 2️⃣ Meeting today, still unconfirmed (heuristic: no reminder marked 'sent' for that meeting)
  const todayStr = now.toISOString().slice(0, 10);
  const reminders = getReminders();
  const confirmedMeetingIds = new Set(
    reminders
      .filter((r) => r.status === "sent" && r.meetingId)
      .map((r) => r.meetingId as string)
  );
  const todayMeeting = meetings
    .filter((m) => m.date === todayStr)
    .filter((m) => !confirmedMeetingIds.has(m.id))
    .sort((a, b) => a.time.localeCompare(b.time))[0];

  if (todayMeeting) {
    return {
      icon: <CalendarCheck className="h-5 w-5" />,
      label: "Confirmar reunião",
      title: todayMeeting.company,
      subtitle: `Hoje às ${todayMeeting.time}`,
      action: "Envie a confirmação de presença para o lead.",
      tone: "warn",
    };
  }

  // 3️⃣ Documento de Guerra (internal — build diagnóstico)
  const dgLead = leads
    .filter((l) => l.stage === "Documento de Guerra")
    .sort((a, b) => new Date(a.stageChangedAt).getTime() - new Date(b.stageChangedAt).getTime())[0];
  if (dgLead) {
    return {
      icon: <FileText className="h-5 w-5" />,
      label: "Documento de Guerra",
      title: dgLead.company,
      subtitle: "Uso interno — base da Reunião 2",
      action: "Construa o diagnóstico estratégico para apresentar na Reunião de Alinhamento.",
      tone: "info",
    };
  }

  // 4️⃣ Proposta pendente — em "Proposta Enviada" há mais de 2 dias sem movimento
  const propostaLead = leads
    .filter((l) => l.stage === "Proposta Enviada")
    .filter((l) => (now.getTime() - new Date(l.stageChangedAt).getTime()) > 2 * 86_400_000)
    .sort((a, b) => new Date(a.stageChangedAt).getTime() - new Date(b.stageChangedAt).getTime())[0];
  if (propostaLead) {
    return {
      icon: <FileSignature className="h-5 w-5" />,
      label: "Proposta pendente",
      title: propostaLead.company,
      subtitle: "Aguardando retorno / envio",
      action: "Finalize e envie a proposta comercial ou faça o follow-up.",
      tone: "info",
    };
  }

  // 5️⃣ Follow-up pendente — reminder vencido
  const overdueReminder = reminders
    .filter((r) => r.status === "pending" && new Date(r.scheduledFor).getTime() < now.getTime())
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  if (overdueReminder) {
    const lead = leads.find((l) => l.id === overdueReminder.leadId);
    return {
      icon: <Phone className="h-5 w-5" />,
      label: "Follow-up pendente",
      title: lead?.company || overdueReminder.title,
      subtitle: overdueReminder.title,
      action: "Entre em contato hoje.",
      tone: "warn",
    };
  }

  // 6️⃣ Sem pendências — próxima cidade para prospecção
  const coldStages = getStagesForPipeline("cold_call");
  const coldStagesSet = new Set(coldStages);
  const coldLeads = leads.filter((l) => coldStagesSet.has(l.stage));
  const perCity = new Map<string, { contacted: number; untouched: number; niches: Map<string, number> }>();
  for (const l of coldLeads) {
    const city = (l.city || "").trim();
    if (!city) continue;
    const entry = perCity.get(city) || { contacted: 0, untouched: 0, niches: new Map() };
    if (l.stage === "Novo Lead") {
      entry.untouched += 1;
      const n = (l.niche || "").trim();
      if (n) entry.niches.set(n, (entry.niches.get(n) || 0) + 1);
    } else {
      entry.contacted += 1;
    }
    perCity.set(city, entry);
  }
  const candidates = [...perCity.entries()]
    .filter(([, v]) => v.untouched > 0)
    .sort((a, b) => a[1].contacted - b[1].contacted);

  if (candidates.length > 0) {
    const [city, data] = candidates[0];
    const topNiche = [...data.niches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      icon: <Target className="h-5 w-5" />,
      label: "Próxima prospecção",
      title: city,
      subtitle: topNiche ? `Nicho sugerido: ${topNiche} · ${data.untouched} leads novos` : `${data.untouched} leads novos`,
      action: "Meta: 20 ligações no próximo pomodoro.",
      tone: "idle",
    };
  }

  return {
    icon: <Target className="h-5 w-5" />,
    label: "Sem pendências",
    title: "Tudo em dia",
    action: "Importe novos leads ou revise o pipeline.",
    tone: "idle",
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
          {p.subtitle && (
            <p className="text-xs text-muted-foreground truncate">{p.subtitle}</p>
          )}
          <p className="text-xs text-foreground/80 mt-0.5">{p.action}</p>
        </div>
        {p.cta && (
          p.cta.href ? (
            <a href={p.cta.href} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                {p.cta.text}
              </Button>
            </a>
          ) : (
            <Button size="sm" onClick={p.cta.onClick} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {p.cta.text}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
