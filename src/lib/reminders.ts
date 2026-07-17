// Reminder generation and scheduling rules for scheduled meetings.
import { uload as loadFromStorage, usave as saveToStorage } from "./userStorage";
import type { Lead, Meeting } from "./store";

export type ReminderStatus = "pending" | "sent" | "dismissed";

export interface Reminder {
  id: string;
  leadId: string;
  meetingId?: string;
  kind: string;
  title: string;
  message: string;
  scheduledFor: string; // ISO
  status: ReminderStatus;
  createdAt: string;
  sentAt?: string;
  notified?: boolean;
}

const KEY = "p21_reminders";

export function getReminders(): Reminder[] {
  return loadFromStorage<Reminder[]>(KEY, []);
}

export function saveReminders(r: Reminder[]) {
  saveToStorage(KEY, r);
}

export function upsertReminders(newOnes: Reminder[]) {
  const all = getReminders();
  saveReminders([...all, ...newOnes]);
}

export function markReminderStatus(id: string, status: ReminderStatus) {
  const all = getReminders();
  const idx = all.findIndex((r) => r.id === id);
  if (idx !== -1) {
    all[idx] = {
      ...all[idx],
      status,
      sentAt: status === "sent" ? new Date().toISOString() : all[idx].sentAt,
    };
    saveReminders(all);
  }
}

export function markReminderNotified(id: string) {
  const all = getReminders();
  const idx = all.findIndex((r) => r.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], notified: true };
    saveReminders(all);
  }
}

export function deleteReminder(id: string) {
  saveReminders(getReminders().filter((r) => r.id !== id));
}

/** Cancel pending reminders for a lead. If `kindsPrefix` given, only those. */
export function cancelPendingReminders(leadId: string, kindPrefixes?: string[]) {
  const all = getReminders();
  const kept = all.filter((r) => {
    if (r.leadId !== leadId) return true;
    if (r.status !== "pending") return true;
    if (kindPrefixes && !kindPrefixes.some((p) => r.kind.startsWith(p))) return true;
    return false;
  });
  saveReminders(kept);
}

// ---------- Message templates ----------

function protocolFor(lead: Lead) {
  return "#" + lead.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function meetingDateTime(meeting: Meeting): Date {
  return new Date(`${meeting.date}T${meeting.time}:00`);
}

function firstName(name: string) {
  return (name || "").trim().split(/\s+/)[0] || name || "";
}

interface BuiltReminder {
  kind: string;
  title: string;
  message: string;
  scheduledFor: Date;
}

export function buildReminderMessages(lead: Lead, meeting: Meeting): BuiltReminder[] {
  const meetingAt = meetingDateTime(meeting);
  const now = new Date();
  const nome = firstName(meeting.contactName || lead.contact || lead.company);
  const empresa = lead.company;
  const dataStr = fmtDate(meetingAt);
  const horaStr = fmtTime(meetingAt);
  const link = meeting.meetLink || meeting.link || "[LINK DA CALL]";
  const proto = protocolFor(lead);

  const out: BuiltReminder[] = [];

  // 1) Reserva confirmada — imediato
  out.push({
    kind: "reserva-confirmada",
    title: `Reserva confirmada — ${empresa}`,
    message:
      `Reserva confirmada\n\n` +
      `Protocolo: ${proto}\n\n` +
      `Nome da Empresa: ${empresa}\n\n` +
      `Contato: ${nome}\n\n` +
      `Data: ${dataStr}\n\n` +
      `Horário: ${horaStr}\n\n` +
      `Informação importante: Lembrando que para reagendar, é necessário aviso prévio. ` +
      `Há outras empresas da sua região na fila de espera.`,
    scheduledFor: now,
  });

  const hoursUntil = (meetingAt.getTime() - now.getTime()) / 36e5;

  // 2) 48h antes — boas-vindas + autoridade
  if (hoursUntil > 48) {
    const t48 = new Date(meetingAt.getTime() - 48 * 3600 * 1000);
    out.push({
      kind: "boas-vindas",
      title: `Boas-vindas — ${empresa}`,
      message:
        `${nome}, é um prazer conversar com você. Obrigado por reservar esse tempo. ` +
        `Estamos animados com a possibilidade de ajudar ${empresa} a estruturar um processo ` +
        `comercial mais previsível. Qualquer dúvida antes da nossa conversa, pode falar aqui.`,
      scheduledFor: t48,
    });
    out.push({
      kind: "autoridade",
      title: `Autoridade social — ${empresa}`,
      message:
        `Para você entender um pouco mais sobre o nosso trabalho: a Performance21 é uma ` +
        `consultoria de engenharia de receita. Nosso foco é construir processos que geram ` +
        `demanda previsível sem depender de indicação e sem brigar por preço. ` +
        `Site: performance21.com.br`,
      scheduledFor: new Date(t48.getTime() + 60 * 1000), // 1 min depois
    });
  }

  // 3) 24h antes — reforço de valor (opcional) + obrigatória
  if (hoursUntil > 24) {
    const t24 = new Date(meetingAt.getTime() - 24 * 3600 * 1000);
    out.push({
      kind: "reforco-valor",
      title: `Reforço de valor (opcional) — ${empresa}`,
      message:
        `${nome}, nossa conversa de amanhã vai ser bem objetiva. Você vai sair com um ` +
        `diagnóstico claro da sua operação e as principais alavancas de crescimento para o ` +
        `seu mercado. Prepare papel e caneta — vai valer.`,
      scheduledFor: t24,
    });
    out.push({
      kind: "objetivos-obrigatoria",
      title: `Mensagem obrigatória 24h — ${empresa}`,
      message:
        `Olá, ${nome}! Tudo bem? Quero repassar os objetivos da nossa conversa de amanhã:\n\n` +
        `✅ Você vai ter um diagnóstico real da sua operação comercial\n` +
        `✅ Vai entender as principais alavancas de crescimento para o seu nicho\n` +
        `✅ Vai sair com clareza sobre o que está travando a sua receita\n\n` +
        `Data: ${dataStr} | Horário: ${horaStr}\n\n` +
        `Estou aqui se precisar de algo.`,
      scheduledFor: new Date(t24.getTime() + 60 * 1000),
    });
  }

  // 5) Complemento — noite anterior (se reunião pela manhã) OU 9h do dia (se à tarde)
  const meetingHour = meetingAt.getHours();
  const complementoMsg =
    `Reforçando nosso compromisso de amanhã:\n\n` +
    `✔️ A reunião dura 30 a 40 minutos\n` +
    `✔️ Deixe seu equipamento pronto (celular ou computador)\n` +
    `✔️ Câmera ligada — queremos olhar no olho\n` +
    `✔️ Papel e caneta para anotações\n\n` +
    `❌ Não realizamos se você estiver dirigindo ou distraído\n` +
    `❌ Precisa ser o dono ou sócio\n` +
    `❌ Atraso superior a 20 min cancela automaticamente\n\n` +
    `Temos empresas da sua região na fila. Sem justificativa, somos obrigados a liberar o horário.`;
  let complementoAt: Date;
  if (meetingHour < 12) {
    // véspera às 20h
    complementoAt = new Date(meetingAt);
    complementoAt.setDate(complementoAt.getDate() - 1);
    complementoAt.setHours(20, 0, 0, 0);
  } else {
    // mesmo dia às 9h
    complementoAt = new Date(meetingAt);
    complementoAt.setHours(9, 0, 0, 0);
  }
  if (complementoAt.getTime() > now.getTime()) {
    out.push({
      kind: "complemento-noite-manha",
      title: `Complemento — ${empresa}`,
      message: complementoMsg,
      scheduledFor: complementoAt,
    });
  }

  // 6) 2h antes — check 1
  const t2h = new Date(meetingAt.getTime() - 2 * 3600 * 1000);
  if (t2h.getTime() > now.getTime()) {
    out.push({
      kind: "check-2h",
      title: `Check 2h antes — ${empresa}`,
      message:
        `DIA DA CALL — Check 1 (2 horas antes)\n\n` +
        `Opção 1 — Texto:\n"Bom dia, ${nome}! Acabei de sair de uma alinhada com minha equipe ` +
        `e eles me deram sinal verde para nossa conversa hoje às ${horaStr}. Está tudo certo por aí também?"\n\n` +
        `Opção 2 — Áudio (30-45s): humano e consultivo, confirme horário e pergunte se está tudo certo.\n\n` +
        `Opção 3 — Vídeo curto (20-40s):\n"Oi ${nome}, aqui é o Vítor da Performance21. Gravando ` +
        `esse vídeo rapidinho só pra reforçar nosso compromisso de hoje às ${horaStr}. Vai ser ` +
        `um papo bem objetivo e direto — você vai sair com clareza para avançar. Te espero lá!"\n\n` +
        `Opção 4 — Ligação:\n"Fala ${nome}, tudo certo? Passando pra confirmar nosso horário de ` +
        `hoje, ${horaStr}. Você está pronto para nossa Reunião de Diagnóstico? Conto contigo online — fechado?"`,
      scheduledFor: t2h,
    });
  }

  // 7) 30min antes — check 2
  const t30 = new Date(meetingAt.getTime() - 30 * 60 * 1000);
  if (t30.getTime() > now.getTime()) {
    out.push({
      kind: "check-30min",
      title: `Check 30min antes — ${empresa}`,
      message:
        `Check 2 — 30 minutos antes\n\n` +
        `Texto:\n"Vou te mandar o link agora. Daqui 30 minutos a gente se fala. ${link}"\n\n` +
        `Áudio:\n"Fala ${nome}! Passando aqui pra lembrar que está chegando nosso horário. ` +
        `Faltam uns 30 minutinhos. Deixa tudo pronto: câmera ligada, papel e caneta. ` +
        `Quero que a gente faça um papo de alto nível hoje. Te espero lá!"`,
      scheduledFor: t30,
    });
  }

  // 8) 10min antes — link sala
  const t10 = new Date(meetingAt.getTime() - 10 * 60 * 1000);
  if (t10.getTime() > now.getTime()) {
    out.push({
      kind: "link-sala",
      title: `Sala aberta — ${empresa}`,
      message: `${link}\n\nEstamos aqui na sala no seu aguardo. Qualquer dificuldade pode me chamar.`,
      scheduledFor: t10,
    });
  }

  return out;
}

export function buildNoShowReminders(lead: Lead, meeting: Meeting): BuiltReminder[] {
  const nome = firstName(meeting.contactName || lead.contact || lead.company);
  const meetingAt = meetingDateTime(meeting);
  const now = new Date();

  const t15 = new Date(meetingAt.getTime() + 15 * 60 * 1000);
  const t2h = new Date(meetingAt.getTime() + 2 * 3600 * 1000);
  const at15 = t15.getTime() < now.getTime() ? new Date(now.getTime() + 30 * 1000) : t15;
  const at2h = t2h.getTime() < now.getTime() ? new Date(now.getTime() + 60 * 1000) : t2h;

  return [
    {
      kind: "no-show-imediato",
      title: `No show — ${lead.company}`,
      message:
        `${nome}, tudo bem? Te aguardamos agora para nossa conversa e não conseguimos te ` +
        `localizar. Quero muito te ajudar. Podemos remarcar ainda essa semana? Minha agenda ` +
        `está bem apertada, mas te priorizo se for importante para você.`,
      scheduledFor: at15,
    },
    {
      kind: "no-show-2h",
      title: `No show 2h — ${lead.company}`,
      message:
        `${nome}, tudo bem? Pensei em três hipóteses:\n\n` +
        `1️⃣ Você queria participar, mas algo deu errado e não conseguiu entrar.\n` +
        `2️⃣ Você decidiu não avançar, mas não quis falar.\n` +
        `3️⃣ Houve algum problema que te impediu de avisar.\n\n` +
        `Qual dessas é? Para eu saber como te ajudar ou te liberar em paz.`,
      scheduledFor: at2h,
    },
  ];
}

/** Convenience: build + persist reminders for a scheduled meeting. */
export function createRemindersForMeeting(lead: Lead, meeting: Meeting) {
  // Remove any existing meeting-related pending reminders for this lead
  cancelPendingReminders(lead.id, [
    "reserva-confirmada", "boas-vindas", "autoridade", "reforco-valor",
    "objetivos-obrigatoria", "complemento-noite-manha", "check-2h",
    "check-30min", "link-sala",
  ]);
  const built = buildReminderMessages(lead, meeting);
  const now = new Date().toISOString();
  const reminders: Reminder[] = built.map((b) => ({
    id: crypto.randomUUID(),
    leadId: lead.id,
    meetingId: meeting.id,
    kind: b.kind,
    title: b.title,
    message: b.message,
    scheduledFor: b.scheduledFor.toISOString(),
    status: "pending",
    createdAt: now,
  }));
  upsertReminders(reminders);
  return reminders;
}

export function createNoShowRemindersForLead(lead: Lead, meeting: Meeting) {
  cancelPendingReminders(lead.id, ["no-show-imediato", "no-show-2h"]);
  const built = buildNoShowReminders(lead, meeting);
  const now = new Date().toISOString();
  const reminders: Reminder[] = built.map((b) => ({
    id: crypto.randomUUID(),
    leadId: lead.id,
    meetingId: meeting.id,
    kind: b.kind,
    title: b.title,
    message: b.message,
    scheduledFor: b.scheduledFor.toISOString(),
    status: "pending",
    createdAt: now,
  }));
  upsertReminders(reminders);
  return reminders;
}
