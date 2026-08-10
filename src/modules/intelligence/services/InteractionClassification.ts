// Atualização da estrutura para suportar a classificação fina de interações.
// Este arquivo é interno para governança do SOC.

export interface InteractionClassification {
  connected: boolean;
  gatekeeper_contact: boolean;
  gatekeeper_name?: string | null;
  decision_maker_identified: boolean;
  decision_maker_name?: string | null;
  decision_maker_contacted: boolean;
  decision_maker_contact_obtained: boolean;
  decision_maker_phone?: string | null;
  message_forwarding_promised: boolean;
  callback_requested: boolean;
  callback_datetime?: string | null;
  follow_up_required: boolean;
  follow_up_datetime?: string | null;
  next_action?: string | null;
  access_status: 
    | "SEM_CONTATO" 
    | "GATEKEEPER" 
    | "DECISOR_IDENTIFICADO" 
    | "CONTATO_OBTIDO" 
    | "ENCAMINHAMENTO_PROMETIDO" 
    | "RETORNO_COMBINADO" 
    | "DECISOR_CONTATADO" 
    | "REUNIAO_MARCADA";
  classification_confidence: "high" | "medium" | "low";
}

// Extensão do objeto de interação original (ou apenas associado)
export interface ExtendedInteraction {
  classification?: InteractionClassification;
}
