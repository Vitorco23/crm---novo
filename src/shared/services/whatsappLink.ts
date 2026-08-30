// Gera links wa.me para abrir o WhatsApp (Web ou app) com a mensagem já
// pronta no campo de digitação — o usuário só revisa e aperta enviar.
// Mesma normalização de telefone já usada no resto do sistema (ver bug de
// telefone corrigido em inboundFormatting.test.ts) — nunca uma segunda
// regra de formatação em paralelo.
import { normalizePhoneBR } from "@/shared/services/inboundFormatting";

/**
 * @param phone Telefone do lead (qualquer formato — será normalizado).
 * @param message Texto já com os placeholders resolvidos. Opcional: sem
 *   mensagem, o link só abre a conversa.
 * @returns URL wa.me pronta, ou null se não houver telefone válido.
 */
export function buildWaLink(phone: string | undefined | null, message?: string): string | null {
  const normalized = normalizePhoneBR(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  const text = (message || "").trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Telefone preferido para WhatsApp de um lead: campo `whatsapp` dedicado, com fallback pro `phone` geral. */
export function leadWhatsappPhone(lead: { whatsapp?: string; phone?: string }): string | undefined {
  return lead.whatsapp || lead.phone;
}
