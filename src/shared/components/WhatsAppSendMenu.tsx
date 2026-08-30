// Botão reutilizável de "Enviar WhatsApp" — em qualquer tela que já tenha o
// contexto de um lead (painel de detalhe, card do Pipeline, card do Cold
// Call), abre um menu com as mensagens de follow-up de cold call já
// prontas (placeholders resolvidos) e gera o link wa.me ao clicar.
//
// Não envia nada sozinho: só abre o WhatsApp (Web ou app) com o texto no
// campo de digitação — quem revisa e aperta enviar é o vendedor.
import { MessageCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Lead, Meeting } from "@/shared/services/store";
import { renderReminderTemplate } from "@/modules/agenda/services/reminders";
import { COLD_CALL_WHATSAPP_MESSAGES } from "@/modules/cold-call/services/whatsappColdCallMessages";
import { buildWaLink, leadWhatsappPhone } from "@/shared/services/whatsappLink";

interface WhatsAppSendMenuProps {
  lead: Lead;
  meeting?: Meeting;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost";
  className?: string;
  /** Texto plano (o vendedor pode passar aqui a mensagem já escolhida — ex.: de um Lembrete ou de um outcome de ligação) — pula o menu de escolha. */
  presetMessage?: string;
  label?: string;
}

export function WhatsAppSendMenu({
  lead,
  meeting,
  size = "sm",
  variant = "outline",
  className,
  presetMessage,
  label = "WhatsApp",
}: WhatsAppSendMenuProps) {
  const phone = leadWhatsappPhone(lead);
  const disabled = !phone;

  if (presetMessage !== undefined) {
    const href = buildWaLink(phone, presetMessage);
    return (
      <Button asChild={!disabled} size={size} variant={variant} className={className} disabled={disabled}>
        {disabled ? (
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" /> {label}
          </span>
        ) : (
          <a href={href!} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> {label}
          </a>
        )}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className={className} disabled={disabled}>
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {COLD_CALL_WHATSAPP_MESSAGES.map((m) => {
          const text = renderReminderTemplate(m.text, lead, meeting);
          const href = buildWaLink(phone, text);
          return (
            <DropdownMenuItem key={m.id} asChild disabled={!href}>
              <a
                href={href || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-xs"
              >
                {m.label}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
