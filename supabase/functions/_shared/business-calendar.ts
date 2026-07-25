// Contexto de calendário comercial da Performance21.
// Regra: operação comercial roda apenas de segunda a sexta.
// Sábado e domingo NÃO são dias úteis, salvo se houver tarefa/reunião
// explicitamente agendada pelo usuário nesse dia.

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const TZ = "America/Sao_Paulo";

function partsInTZ(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return parts as Record<string, string>;
}

function dowInTZ(d: Date): number {
  // 0=dom ... 6=sab
  const wd = partsInTZ(d).weekday;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? d.getUTCDay();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoDate(d: Date): string {
  const p = partsInTZ(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function nextBusinessDay(from: Date = new Date()): Date {
  let d = addDays(from, 1);
  while (dowInTZ(d) === 0 || dowInTZ(d) === 6) d = addDays(d, 1);
  return d;
}

export function isBusinessDay(d: Date = new Date()): boolean {
  const w = dowInTZ(d);
  return w >= 1 && w <= 5;
}

export function buildBusinessCalendarBlock(now: Date = new Date()): string {
  const dow = dowInTZ(now);
  const hoje = DIAS_SEMANA[dow];
  const amanha = DIAS_SEMANA[(dow + 1) % 7];
  const hojeUtil = isBusinessDay(now);
  const proxUtil = nextBusinessDay(now);
  const proxUtilNome = DIAS_SEMANA[dowInTZ(proxUtil)];

  return [
    "CONTEXTO DE CALENDÁRIO (Performance21):",
    `- Fuso: ${TZ}.`,
    `- Hoje é ${hoje} (${isoDate(now)}).`,
    `- Amanhã é ${amanha}.`,
    `- Hoje ${hojeUtil ? "É" : "NÃO É"} dia útil.`,
    `- Próximo dia útil: ${proxUtilNome} (${isoDate(proxUtil)}).`,
    "REGRA OPERACIONAL OBRIGATÓRIA:",
    "- A operação comercial roda somente de segunda a sexta.",
    "- Sábado e domingo NÃO são dias de trabalho por padrão.",
    "- NUNCA sugira ligar, prospectar, enviar proposta ou fazer follow-up em sábado/domingo,",
    "  a menos que exista tarefa/reunião explicitamente agendada pelo usuário nesse dia.",
    "- Se hoje for sábado/domingo e não houver compromisso agendado, oriente descanso e",
    "  planejamento leve para o próximo dia útil; as ações executáveis devem apontar para",
    "  o próximo dia útil, não para hoje ou amanhã se ambos forem fim de semana.",
    "- Ao citar prazos ('hoje', 'amanhã', 'próxima terça'), use o calendário acima.",
  ].join("\n");
}
