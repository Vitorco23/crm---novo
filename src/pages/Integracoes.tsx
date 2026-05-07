import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, AlertCircle, Loader2, ExternalLink, Database, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportAllData, importBackup, getStorageStats } from "@/lib/userStorage";

type Status = "loading" | "connected" | "not_connected" | "error";

export default function Integracoes() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const check = async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-status");
      if (error) throw error;
      if (data?.connected) {
        setStatus("connected");
      } else {
        setStatus("not_connected");
        if (data?.error) setErrorMsg(data.error);
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { check(); }, []);

  const testCreate = async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000); // 1h
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    toast.loading("Criando evento de teste...", { id: "test" });
    const { data, error } = await supabase.functions.invoke("create-google-meeting", {
      body: {
        summary: "Teste — CRM Performance21",
        description: "Evento de teste criado pelo CRM. Pode apagar.",
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        withMeet: true,
      },
    });
    toast.dismiss("test");
    if (error || data?.error) {
      toast.error("Falha no teste", { description: data?.details || data?.error || error?.message });
      return;
    }
    toast.success("Evento de teste criado!", {
      description: "Verifique sua agenda Google.",
      action: data?.htmlLink ? { label: "Abrir", onClick: () => window.open(data.htmlLink, "_blank") } : undefined,
    });
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Integrações</h1>
        <p className="text-xs text-muted-foreground">Conecte serviços externos ao CRM</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="text-base">Google Agenda</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cria automaticamente eventos com link do Meet quando você marca uma reunião e envia convite ao lead por e-mail.
                </p>
              </div>
            </div>
            {status === "loading" && (
              <Badge variant="outline" className="shrink-0"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando</Badge>
            )}
            {status === "connected" && (
              <Badge className="shrink-0 bg-accent/20 text-accent border-accent/40 hover:bg-accent/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            )}
            {status === "not_connected" && (
              <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">
                <AlertCircle className="h-3 w-3 mr-1" /> Não conectado
              </Badge>
            )}
            {status === "error" && (
              <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">
                <AlertCircle className="h-3 w-3 mr-1" /> Erro
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {errorMsg && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2 mb-3 break-words">{errorMsg}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={check}>Verificar novamente</Button>
            {status === "connected" && (
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={testCreate}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Criar evento de teste
              </Button>
            )}
          </div>

          {status === "not_connected" && (
            <div className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded p-3">
              Para conectar sua conta Google, peça no chat: <span className="text-accent font-medium">"conectar minha conta Google Calendar"</span>.
              Você só precisa fazer isso uma vez.
            </div>
          )}

          {status === "connected" && (
            <div className="mt-3 text-xs text-muted-foreground space-y-1">
              <p>✓ Eventos criados na sua agenda principal (<code className="text-foreground">primary</code>)</p>
              <p>✓ Link do Google Meet gerado automaticamente</p>
              <p>✓ Convite enviado por e-mail para o lead (quando o e-mail é informado)</p>
            </div>
          )}
        </CardContent>
      </Card>

      <BackupCard />
    </div>
  );
}

function BackupCard() {
  const [stats, setStats] = useState(getStorageStats());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setStats(getStorageStats()), 3000);
    return () => clearInterval(t);
  }, []);

  const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024/1024).toFixed(2)} MB`;
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR") : "—";

  const handleExport = () => {
    try {
      const json = exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado");
    } catch (e) {
      toast.error("Falha ao exportar", { description: String(e) });
    }
  };

  const handleImport = async (mode: "merge" | "replace") => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Escolha um arquivo .json primeiro"); return; }
    if (mode === "replace" && !confirm("Substituir TODOS os dados atuais pelo backup? Um snapshot será salvo automaticamente.")) return;
    try {
      const txt = await file.text();
      const n = await importBackup(txt, mode);
      toast.success(`Backup importado (${n} chaves)`, { description: "Recarregue a página para ver tudo." });
      setStats(getStorageStats());
    } catch (e) {
      toast.error("Falha ao importar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
            <Database className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-base">Backup & Diagnóstico</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exporte seus dados como segurança extra ou restaure de um arquivo.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Leads</div>
            <div className="text-foreground font-semibold">{stats.leadsCount}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Chaves</div>
            <div className="text-foreground font-semibold">{stats.keys}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Tamanho</div>
            <div className="text-foreground font-semibold">{fmtBytes(stats.sizeBytes)}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Último sync</div>
            <div className="text-foreground font-semibold text-[10px]">{fmtDate(stats.lastSync)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar backup
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="text-xs" />
          <Button size="sm" variant="outline" onClick={() => handleImport("merge")}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Importar (mesclar)
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleImport("replace")}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Importar (substituir)
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Snapshots automáticos dos seus dados são guardados localmente antes de qualquer sincronização que sobrescreva o cache.
        </p>
      </CardContent>
    </Card>
  );
}
