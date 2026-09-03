// Endpoint autenticado: retorna slots disponíveis na agenda Google do dono do CRM.
// Requer JWT válido do CRM. Para uso na Landing Page pública, chame a partir
// de um backend proxy que valide o request e ateste identidade via JWT.
//
// GET/POST /google-calendar-availability
// body opcional (JSON):
//   { fromISO?, toISO?, days?, slotMinutes?, workStartHour?, workEndHour?,
//     timeZone?, weekdaysOnly?, calendarId? }
//
// defaults: próximos 7 dias, slots de 30min, 09:00-18:00 (America/Sao_Paulo),
// segunda a sexta, calendário "primary".

import { requireUser } from "../_shared/require-auth.ts";
import { googleCalendarFetch } from "../_shared/google-calendar-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  fromISO?: string;
  toISO?: string;
  days?: number;
  slotMinutes?: number;
  workStartHour?: number;
  workEndHour?: number;
  timeZone?: string;
  weekdaysOnly?: boolean;
  calendarId?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Converte um instante UTC para o "wall time" em uma timezone (retorna partes).
function wallTimeParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday as string, // Mon, Tue...
  };
}

// Retorna o offset (em minutos) da timezone em relação ao UTC para uma data.
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

// Cria um Date (UTC) a partir de um wall time em uma timezone.
function wallTimeToUTC(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  // Primeira aproximação assumindo UTC, depois ajusta pelo offset da tz nesse instante.
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
  const offset = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offset * 60000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  let body: Body = {};
  if (req.method === "POST") {
    try { body = (await req.json()) as Body; } catch { body = {}; }
  } else {
    const url = new URL(req.url);
    body = Object.fromEntries(url.searchParams.entries()) as any;
    if (body.days) body.days = Number(body.days);
    if (body.slotMinutes) body.slotMinutes = Number(body.slotMinutes);
    if (body.workStartHour) body.workStartHour = Number(body.workStartHour);
    if (body.workEndHour) body.workEndHour = Number(body.workEndHour);
    if ((body as any).weekdaysOnly) body.weekdaysOnly = String((body as any).weekdaysOnly) === "true";
  }

  const timeZone = body.timeZone || "America/Sao_Paulo";
  const slotMinutes = Math.max(15, Math.min(120, body.slotMinutes ?? 30));
  const workStartHour = body.workStartHour ?? 9;
  const workEndHour = body.workEndHour ?? 18;
  const weekdaysOnly = body.weekdaysOnly !== false;
  const days = Math.max(1, Math.min(30, body.days ?? 7));
  const calendarId = body.calendarId || "primary";

  const now = new Date();
  const from = body.fromISO ? new Date(body.fromISO) : now;
  const to = body.toISO ? new Date(body.toISO) : new Date(from.getTime() + days * 24 * 60 * 60_000);

  // 1. freebusy do Google
  let fbData: any;
  try {
    const fbResp = await googleCalendarFetch("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        timeZone,
        items: [{ id: calendarId }],
      }),
    });
    fbData = await fbResp.json();
    if (!fbResp.ok) {
      return json(502, { error: "google_api_error", status: fbResp.status, details: fbData });
    }
  } catch (err) {
    return json(400, { error: "google_calendar_not_connected", message: (err as Error)?.message });
  }

  const busy: { start: string; end: string }[] =
    fbData?.calendars?.[calendarId]?.busy ?? [];
  const busyRanges = busy.map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));

  // 2. Gera slots candidatos no wall time da timezone alvo
  const slots: { startISO: string; endISO: string; label: string }[] = [];
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Itera dia a dia entre `from` e `to`
  const firstParts = wallTimeParts(from, timeZone);
  const cursor = { y: firstParts.year, m: firstParts.month, d: firstParts.day };
  const endParts = wallTimeParts(to, timeZone);
  const endKey = endParts.year * 10000 + endParts.month * 100 + endParts.day;

  while (cursor.y * 10000 + cursor.m * 100 + cursor.d <= endKey) {
    const probe = wallTimeToUTC(cursor.y, cursor.m, cursor.d, 12, 0, timeZone);
    const wd = wallTimeParts(probe, timeZone).weekday;
    const dow = weekdayMap[wd];
    const isWeekend = dow === 0 || dow === 6;

    if (!(weekdaysOnly && isWeekend)) {
      for (let h = workStartHour * 60; h + slotMinutes <= workEndHour * 60; h += slotMinutes) {
        const sh = Math.floor(h / 60);
        const sm = h % 60;
        const startUTC = wallTimeToUTC(cursor.y, cursor.m, cursor.d, sh, sm, timeZone);
        const endUTC = new Date(startUTC.getTime() + slotMinutes * 60_000);
        if (startUTC.getTime() < now.getTime()) continue;

        const conflict = busyRanges.some(r => startUTC.getTime() < r.end && endUTC.getTime() > r.start);
        if (conflict) continue;

        const label = new Intl.DateTimeFormat("pt-BR", {
          timeZone, weekday: "short", day: "2-digit", month: "2-digit",
          hour: "2-digit", minute: "2-digit",
        }).format(startUTC);

        slots.push({
          startISO: startUTC.toISOString(),
          endISO: endUTC.toISOString(),
          label,
        });
      }
    }

    // avança um dia (em wall time)
    const nextDay = wallTimeToUTC(cursor.y, cursor.m, cursor.d, 12, 0, timeZone);
    const next = new Date(nextDay.getTime() + 24 * 60 * 60_000);
    const np = wallTimeParts(next, timeZone);
    cursor.y = np.year; cursor.m = np.month; cursor.d = np.day;
  }

  return json(200, {
    ok: true,
    timeZone,
    slotMinutes,
    workStartHour,
    workEndHour,
    weekdaysOnly,
    from: from.toISOString(),
    to: to.toISOString(),
    slots,
  });
});
