// Sprint 1.1 — bloco mínimo de identidade do usuário para IA conversacional.
// Só nome/cargo/empresa — nunca telefone, foto ou outro dado pessoal.
// Usado por Edge Functions que falam DIRETAMENTE com o usuário (hoje:
// diretor-comercial-ia). Não é um refactor do AI Router nem do
// context-builder — é um helper isolado, chamado manualmente onde fizer
// sentido, para não duplicar a mesma lógica em várias functions.

export interface UserContext {
  name?: string;
  role?: string;
  company?: string;
}

function sanitizeField(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

/** Normaliza o payload recebido do frontend, descartando qualquer campo além de nome/cargo/empresa. */
export function parseUserContext(input: unknown): UserContext | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const name = sanitizeField(raw.name);
  const role = sanitizeField(raw.role);
  const company = sanitizeField(raw.company);
  if (!name && !role && !company) return undefined;
  return { name, role, company };
}

/** Bloco de texto curto para incluir no prompt — só quando houver ao menos um campo. */
export function buildUserContextBlock(ctx: UserContext | undefined): string {
  if (!ctx) return "";
  const lines = [
    ctx.name && `Nome do usuário: ${ctx.name}`,
    ctx.role && `Cargo: ${ctx.role}`,
    ctx.company && `Empresa: ${ctx.company}`,
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `[QUEM ESTÁ PEDINDO]\n${lines.join("\n")}\nTrate essa pessoa pelo nome quando fizer sentido, sem exagerar.`;
}
