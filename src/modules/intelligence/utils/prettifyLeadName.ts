// Sprint 1.2 — apresentação limpa do nome do lead na Missão do Dia.
// Puramente de exibição: nunca escreve de volta no banco/localStorage.
// Ex.: "02 - Odonto10x | Clínica Odontológica e Estética | Dentista Desde
// 1999 | Aracaju - Aracaju" -> { name: "Odonto10x", detail: "Clínica
// Odontológica e Estética" }

export interface PrettyLeadName {
  name: string;
  detail?: string;
}

export function prettifyLeadName(raw: string | null | undefined): PrettyLeadName {
  const fallback = { name: "Lead" };
  if (!raw) return fallback;

  // Muitos registros vêm com prefixo numérico de importação: "02 - Nome".
  const withoutIndex = raw.replace(/^\s*\d{1,4}\s*-\s*/, "");

  // Campos concatenados com "|" — o primeiro é o nome fantasia real.
  const segments = withoutIndex
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const name = (segments[0] || withoutIndex.trim() || raw.trim()).slice(0, 60);
  const detail = segments[1]?.slice(0, 48);

  return name ? { name, detail } : fallback;
}
