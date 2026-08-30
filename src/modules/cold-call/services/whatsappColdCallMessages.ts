// Mensagens de WhatsApp para cenários de cold call fora do funil de reunião
// (esses já são cobertos por Lembretes → Configurar templates, que dispara
// a partir da etapa "Reunião Marcada" em diante). Estas cobrem o dia a dia
// de ligação: atendeu/não atendeu, pediu retorno, número errado, etc.
//
// Placeholders resolvidos pelo MESMO sistema já usado em Lembretes
// (renderReminderTemplate, em @/modules/agenda/services/reminders) —
// nenhuma lógica de substituição nova foi criada.
import type { CadenceOutcome } from "@/shared/services/activityLedger";

export interface ColdCallMessageOption {
  id: string;
  /** Rótulo curto mostrado no menu de escolha. */
  label: string;
  /** Texto com placeholders — passar por renderReminderTemplate antes de usar. */
  text: string;
  /**
   * Outcomes de ConcluirTentativaDialog (canal Ligação) que sugerem esta
   * mensagem como padrão quando o menu abre logo após concluir a tentativa.
   * Puramente uma sugestão de UI — nunca envia nada sozinho.
   */
  suggestedForOutcomes?: CadenceOutcome[];
}

export const COLD_CALL_WHATSAPP_MESSAGES: ColdCallMessageOption[] = [
  {
    id: "nao_atendeu",
    label: "Ligou e não atendeu",
    suggestedForOutcomes: ["sem_resposta", "caixa_postal"],
    text: "Oi, tudo bem? Aqui é o Vítor da Performance21. Tentei falar com você agora, mas não consegui. Posso te ligar em outro horário, ou prefere que eu te explique por aqui mesmo?",
  },
  {
    id: "pediu_ligar_depois",
    label: "Pediu pra ligar depois",
    suggestedForOutcomes: ["pediu_retorno"],
    text: "Oi, aqui é o Vítor. Como combinamos, vou te chamar em outro momento. Só me confirma: prefere que eu ligue de novo, ou sigo por aqui?",
  },
  {
    id: "pediu_mais_info",
    label: "Decisor pediu mais informação",
    text: "Vítor da Performance21 aqui. Separei o que conversamos por escrito, caso ajude: [resumo curto]. Qualquer dúvida me chama.",
  },
  {
    id: "reativacao_frio",
    label: "Reativação de lead frio",
    text: "Oi, tudo bem? Aqui é o Vítor, da Performance21. Já conversamos antes sobre [contexto breve], e lembrei de vocês agora. Ainda faz sentido pra vocês?",
  },
  {
    id: "contato_repassado",
    label: "Decisor passou outro contato",
    text: "Oi, tudo bem? Aqui é o Vítor da Performance21. O [nome] me passou seu contato, disse que você cuida dessa parte por aí. Posso te explicar rapidinho do que se trata?",
  },
  {
    id: "decidir_com_socio",
    label: "Confirmou, mas quer decidir com sócio/outra pessoa",
    text: "Sem problema! Fico no aguardo então. Se fizer sentido pra vocês, qualquer dúvida que surgir na conversa com [sócio/pessoa], me chama por aqui que te explico.",
  },
  {
    id: "numero_errado",
    label: "Número errado / empresa não é mais essa",
    suggestedForOutcomes: ["contato_invalido"],
    text: "Oi, desculpa o contato. Parece que esse número não é mais da [empresa] — se puder me confirmar, agradeço, assim atualizo por aqui.",
  },
  {
    id: "followup_geral",
    label: "Follow-up geral (sem contexto específico)",
    text: "Oi, tudo bem? Vítor da Performance21 aqui. Passando pra saber se ainda faz sentido a gente conversar sobre [assunto]. Qualquer coisa me chama.",
  },
];

export function findColdCallMessage(id: string): ColdCallMessageOption | undefined {
  return COLD_CALL_WHATSAPP_MESSAGES.find((m) => m.id === id);
}

/** Primeira mensagem sugerida para um outcome de ConcluirTentativaDialog, se houver. */
export function suggestColdCallMessage(outcome: CadenceOutcome | undefined): ColdCallMessageOption | undefined {
  if (!outcome) return undefined;
  return COLD_CALL_WHATSAPP_MESSAGES.find((m) => m.suggestedForOutcomes?.includes(outcome));
}
