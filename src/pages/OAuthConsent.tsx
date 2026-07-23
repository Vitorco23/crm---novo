import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// The Supabase JS client's oauth namespace is beta; type it locally so this
// route compiles even before the SDK exposes it.
type AuthorizationDetails = {
  client?: { name?: string; redirect_uri?: string; redirect_uris?: string[] };
  scope?: string;
  requested_scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        setLoading(false);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou um redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            Conectar {details?.client?.name ?? "aplicativo"} ao Performance21
          </CardTitle>
          <CardDescription>
            Isso permite que o cliente use as ferramentas do CRM agindo como você.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && (
            <div className="text-sm text-destructive">
              Não foi possível carregar esta autorização: {error}
            </div>
          )}
          {details && !error && (
            <>
              <div className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Cliente: </span>
                  <span className="font-medium">{details.client?.name ?? "desconhecido"}</span>
                </div>
                {details.client?.redirect_uri && (
                  <div className="text-xs text-muted-foreground break-all">
                    Redirect: {details.client.redirect_uri}
                  </div>
                )}
                {details.scope && (
                  <div className="text-xs text-muted-foreground">Escopos: {details.scope}</div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Este acesso não ignora as permissões do CRM: cada requisição continua sujeita
                às regras de segurança (RLS) da sua conta.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>
                  Cancelar
                </Button>
                <Button disabled={busy} onClick={() => decide(true)}>
                  {busy ? "Autorizando…" : "Aprovar"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
