// Callback do fluxo OAuth do Google Calendar (conta compartilhada da
// empresa). Uso único, manual, feito pelo administrador do CRM:
//
//   1. Admin acessa a URL de autorização do Google (montada com
//      GOOGLE_OAUTH_CLIENT_ID + este endpoint como redirect_uri),
//      loga com a conta Google da empresa e autoriza.
//   2. Google redireciona pra cá com ?code=...
//   3. Trocamos o code por um refresh_token (só é emitido com
//      access_type=offline&prompt=consent na URL de autorização).
//   4. Mostramos o refresh_token na tela UMA VEZ — o admin copia e envia
//      pra ser configurado como secret (GOOGLE_CALENDAR_REFRESH_TOKEN).
//      Não persistimos o token em lugar nenhum: nem banco, nem log.
//
// Não requer JWT (verify_jwt = false no config.toml) porque quem chama é
// o navegador do admin, vindo do redirect do Google — não uma sessão do
// CRM autenticada via Supabase Auth.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
// Precisa bater EXATAMENTE com a Authorized redirect URI cadastrada no
// Google Cloud Console — url.origin do request via Supabase edge runtime
// nem sempre reflete o domínio público, causando redirect_uri_mismatch.
const REDIRECT_URI = "https://dxcmacdudfrzlgatolzn.supabase.co/functions/v1/google-oauth-callback";

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google Calendar — P21 CRM</title>
     <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.5}
     code{background:#f0f0f0;padding:2px 6px;border-radius:4px;word-break:break-all}
     .token{background:#111;color:#0f0;padding:16px;border-radius:8px;font-family:monospace;word-break:break-all;margin:16px 0}
     .warn{color:#b45309;font-weight:600}</style></head><body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return html(`<h1>Autorização cancelada</h1><p>O Google retornou o erro: <code>${error}</code>. Feche esta aba e tente de novo.</p>`, 400);
  }
  if (!code) {
    return html(`<h1>Faltou o parâmetro "code"</h1><p>Acesse esta página a partir do link de autorização do Google, não direto.</p>`, 400);
  }

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return html(`<h1>Configuração incompleta</h1><p><code>GOOGLE_OAUTH_CLIENT_ID</code>/<code>GOOGLE_OAUTH_CLIENT_SECRET</code> ainda não foram configurados como secrets deste projeto.</p>`, 500);
  }

  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return html(`<h1>Falha ao trocar o código</h1><pre>${JSON.stringify(data, null, 2)}</pre>`, 502);
    }
    if (!data.refresh_token) {
      return html(
        `<h1 class="warn">Autorizado, mas sem refresh_token</h1>
         <p>Isso acontece quando essa mesma conta Google já autorizou este app antes.
         Revogue o acesso em <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>
         (procure "Performance21 CRM") e refaça o link de autorização do zero.</p>`,
        200,
      );
    }
    return html(
      `<h1>Conectado!</h1>
       <p>Copie o valor abaixo e envie para ser configurado como <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code>.
       Esta página não guarda esse valor em nenhum lugar — só aparece aqui, agora.</p>
       <div class="token">${data.refresh_token}</div>
       <p class="warn">Depois de copiar, pode fechar esta aba.</p>`,
    );
  } catch (e) {
    return html(`<h1>Erro inesperado</h1><pre>${(e as Error)?.message ?? String(e)}</pre>`, 500);
  }
});
