// NextBestActionCard — bloco único de Próxima Melhor Ação.
// Renderiza cabeçalho + motivo + Pacote de Execução adaptativo.
// Usado por: DiretorComercialIACard, CallAuditView, PriorityLeadsBlock etc.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, AlertTriangle, Phone, MessageCircle, Calendar, FileText,
  Repeat, Clock, Paperclip, XCircle, Trophy, Brain, ArrowRight, ExternalLink,
} from "lucide-react";
import {
  ACTION_META, URGENCY_META, CONFIDENCE_META, ACTION_PACKAGES,
  type NextBestAction, type NBAPackageButton,
} from "@/lib/nextBestAction";
import type { Lead } from "@/lib/store";
import { getPipelineForStage } from "@/lib/store";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";

interface Props {
  nba: NextBestAction;
  lead?: Lead;
  compact?: boolean;
  /** Handler opcional para "Registrar Ligação" quando lead está em contexto. */
  onLogCall?: () => void;
  /** Handler opcional para abrir o diagnóstico completo. */
  onRunDiagnosis?: () => void;
  /** Handler opcional para abrir o modal do lead. */
  onOpenLead?: () => void;
}

function waLink(l?: Lead | null): string | null {
  if (!l) return null;
  const raw = (l.whatsapp || l.phone || "").replace(/\D/g, "");
  if (!raw) return null;
  const num = raw.startsWith("55") ? raw : `55${raw}`;
  return `https://wa.me/${num}`;
}

function pipelineHref(l?: Lead | null): string {
  if (!l) return "/central";
  const p = getPipelineForStage(l.stage);
  if (p === "oportunidades") return "/oportunidades";
  if (p === "onboarding") return "/onboarding";
  return "/";
}

const BTN_ICON: Record<NBAPackageButton, JSX.Element> = {
  call_dialer:        <Phone className="h-3.5 w-3.5" />,
  log_call:           <Phone className="h-3.5 w-3.5" />,
  whatsapp:           <MessageCircle className="h-3.5 w-3.5" />,
  generate_message:   <FileText className="h-3.5 w-3.5" />,
  generate_script:    <FileText className="h-3.5 w-3.5" />,
  schedule_meeting:   <Calendar className="h-3.5 w-3.5" />,
  generate_invite:    <Calendar className="h-3.5 w-3.5" />,
  send_proposal_link: <FileText className="h-3.5 w-3.5" />,
  upload_docs:        <Paperclip className="h-3.5 w-3.5" />,
  register_loss:      <XCircle className="h-3.5 w-3.5" />,
  start_onboarding:   <Trophy className="h-3.5 w-3.5" />,
  run_full_diagnosis: <Brain className="h-3.5 w-3.5" />,
  open_lead:          <ExternalLink className="h-3.5 w-3.5" />,
};

const BTN_LABEL: Record<NBAPackageButton, string> = {
  call_dialer:        "Discar",
  log_call:           "Registrar ligação",
  whatsapp:           "Abrir WhatsApp",
  generate_message:   "Gerar mensagem",
  generate_script:    "Gerar script",
  schedule_meeting:   "Agendar reunião",
  generate_invite:    "Gerar convite",
  send_proposal_link: "Preparar proposta",
  upload_docs:        "Anexar documento",
  register_loss:      "Registrar perda",
  start_onboarding:   "Iniciar onboarding",
  run_full_diagnosis: "Diagnóstico completo",
  open_lead:          "Abrir Lead",
};

export default function NextBestActionCard({
  nba, lead, compact, onLogCall, onRunDiagnosis, onOpenLead,
}: Props) {
  const meta = ACTION_META[nba.action];
  const urg = URGENCY_META[nba.urgency];
  const conf = CONFIDENCE_META[nba.confidence];
  const buttons = ACTION_PACKAGES[nba.action];
  const wa = waLink(lead);
  const tel = lead?.phone?.replace(/\D/g, "");
  const href = pipelineHref(lead);
  const nav = useNavigate();
  const [meetingOpen, setMeetingOpen] = useState(false);

  const insufficient = nba.confidence === "insufficient_context";

  const renderBtn = (b: NBAPackageButton) => {
    const label = BTN_LABEL[b];
    const icon = BTN_ICON[b];
    const cls = "h-7 text-[11px] gap-1";
    switch (b) {
      case "call_dialer":
        if (!tel) return null;
        return (
          <a key={b} href={`tel:${tel}`}>
            <Button size="sm" variant="outline" className={cls}>{icon} {label}</Button>
          </a>
        );
      case "whatsapp":
        if (!wa) return null;
        return (
          <a key={b} href={wa} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className={cls}>{icon} {label}</Button>
          </a>
        );
      case "log_call":
      case "upload_docs":
      case "generate_message":
      case "generate_script":
      case "generate_invite":
      case "send_proposal_link":
      case "register_loss":
      case "start_onboarding":
        return (
          <Button
            key={b} size="sm" variant="outline" className={cls}
            onClick={onOpenLead ?? (() => nav(href))}
          >
            {icon} {label}
          </Button>
        );
      case "schedule_meeting":
        if (!lead) return null;
        return (
          <Button key={b} size="sm" variant="outline" className={cls} onClick={() => setMeetingOpen(true)}>
            {icon} {label}
          </Button>
        );
      case "run_full_diagnosis":
        return (
          <Button
            key={b} size="sm" variant="outline"
            className={`${cls} border-primary/40 text-primary hover:bg-primary/10`}
            onClick={onRunDiagnosis ?? (onOpenLead ?? (() => nav(href)))}
          >
            {icon} {label}
          </Button>
        );
      case "open_lead":
      default:
        return (
          <Button
            key={b} size="sm" variant="outline" className={cls}
            onClick={onOpenLead ?? (() => nav(href))}
          >
            {icon} {label} <ArrowRight className="h-3 w-3" />
          </Button>
        );
    }
  };

  return (
    <>
      <Card className={`border-l-4 ${insufficient ? "border-l-slate-400" : "border-l-accent"} p-3 space-y-2 bg-accent/5`}>
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none pt-0.5">{insufficient ? "🧭" : meta.icon}</div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Próxima Melhor Ação
              </span>
              <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
              {!insufficient && (
                <Badge variant="outline" className={`text-[10px] ${urg.color}`}>
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> {urg.label}
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] ${conf.color}`}>{conf.label}</Badge>
            </div>
            <p className="text-sm font-semibold leading-snug">{nba.title}</p>
            {!compact && (
              <p className="text-[12px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">Motivo: </span>{nba.reason}
              </p>
            )}
            {insufficient && nba.missingContext && nba.missingContext.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-600 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">Para gerar uma recomendação confiável, colete:</div>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {nba.missingContext.map((m, i) => (<li key={i}>{m}</li>))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {!compact && (
          <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-border/40 mt-2 pl-9">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-full font-semibold">
              Executar agora
            </span>
            {buttons.map(renderBtn)}
          </div>
        )}
      </Card>

      {lead && (
        <ScheduleMeetingDialog
          open={meetingOpen}
          onOpenChange={setMeetingOpen}
          lead={lead}
        />
      )}
    </>
  );
}
