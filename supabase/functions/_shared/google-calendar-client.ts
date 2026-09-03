// Cliente direto da Google Calendar API v3 — substitui o Connector Gateway
// do Lovable (connector-gateway.lovable.dev), que exigia LOVABLE_API_KEY.
//
// Modelo: UMA conta Google compartilhada da empresa, conectada uma vez via
// o fluxo OAuth em google-oauth-callback/index.ts. O refresh_token obtido
// naquele fluxo é armazenado como secret (GOOGLE_CALENDAR_REFRESH_TOKEN) —
// não expira sozinho (só se revogado manualmente na conta Google ou não
// usado por 6 meses). A cada chamada, trocamos o refresh_token por um
// access_token de curta duração (~1h); não há necessidade de cache entre
// invocações porque cada invocação de edge function já é uma requisição
// isolada e o custo de mintar um token novo é baixo.

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super("google_calendar_not_connected");
  }
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleCalendarNotConnectedError();
  }

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`google_oauth_refresh_failed: ${resp.status} ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

/** Chama a Google Calendar API v3 diretamente. `path` é relativo, ex:
 * "/calendars/primary/events". Lança GoogleCalendarNotConnectedError se
 * a conexão (OAuth) ainda não foi configurada — quem chama decide como
 * responder (mesmo formato de erro que cada function já usava). */
export async function googleCalendarFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${CALENDAR_BASE}${path}`, { ...init, headers });
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") &&
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") &&
    Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  );
}
