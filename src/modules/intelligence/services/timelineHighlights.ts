// Timeline Inteligente — destaque de acontecimentos relevantes.
// Derivação PURA sobre dados já existentes (interações, ligações, diagnóstico).
// Não chama IA, não altera dados: apenas classifica o que merece atenção.

export interface TimelineHighlight {
  key: string;
  label: string;
  cls: string;
  /** eventos críticos ganham destaque visual maior */
  critical: boolean;
}

const RULES: Array<{ key: string; label: string; re: RegExp; cls: string; critical: boolean }> = [
  {
    key: "proposal_requested",
    label: "📄 Cliente pediu proposta",
    re: /(pediu|solicitou|quer|aguarda(ndo)?|envie|mandar?)\s+(a\s+)?propost/i,
    cls: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    critical: true,
  },
  {
    key: "lost_interest",
    label: "⚠ Sinal de perda de interesse",
    re: /(sem interesse|não tem interesse|nao tem interesse|desistiu|não quer|nao quer|depois eu vejo|deixa pra depois|não é prioridade|nao e prioridade)/i,
    cls: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    critical: true,
  },
  {
    key: "price_objection",
    label: "💰 Objeção de preço/orçamento",
    re: /(caro|preço|preco|valor alto|orçament|orcament|sem verba|investimento alto)/i,
    cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    critical: false,
  },
  {
    key: "decision_maker",
    label: "👤 Decisor identificado",
    re: /(falei com o (dono|sócio|socio|diretor|gestor)|decisor|quem decide)/i,
    cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    critical: false,
  },
  {
    key: "context_change",
    label: "🔄 Mudança importante de contexto",
    re: /(trocou de|mudou (de)?|novo (sócio|socio|gestor|diretor)|reestrutur|abriu (nova )?unidade|fechou (a )?unidade|saiu da empresa)/i,
    cls: "bg-sky-500/15 text-sky-500 border-sky-500/30",
    critical: true,
  },
  {
    key: "commitment",
    label: "🤝 Compromisso assumido",
    re: /(ficou de|prometeu|vai retornar|retorna(r)? (dia|na|em)|me liga|combinamos)/i,
    cls: "bg-primary/10 text-primary border-primary/30",
    critical: false,
  },
];

/** Highlights de um texto de interação/ligação. */
export function highlightsFor(text?: string): TimelineHighlight[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: TimelineHighlight[] = [];
  for (const r of RULES) {
    if (r.re.test(t)) out.push({ key: r.key, label: r.label, cls: r.cls, critical: r.critical });
    if (out.length >= 3) break;
  }
  return out;
}

/** Um evento é crítico quando contém pelo menos um highlight crítico. */
export function isCriticalEvent(highlights: TimelineHighlight[]): boolean {
  return highlights.some((h) => h.critical);
}
