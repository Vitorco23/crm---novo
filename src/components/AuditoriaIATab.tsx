import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  leadCompany: string;
}

export default function AuditoriaIATab({ leadCompany }: Props) {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleGenerate = async () => {
    if (!transcript.trim()) {
      toast.error("Cole a transcrição da reunião antes de gerar a auditoria.");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("audit-transcript", {
        body: { transcript },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult((data as any)?.content ?? "Sem resposta da IA.");
      toast.success("Auditoria gerada");
    } catch (e: any) {
      console.error("[audit-transcript]", e);
      toast.error(e?.message || "Falha ao gerar auditoria");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    toast.success("Copiado");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-accent" />
          Auditoria IA (OpenRouter Teste)
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Auditor comercial automático para reuniões de <b>{leadCompany}</b>. Extrai BANT, gargalo,
          objeções e próximo passo. Modelo gratuito via OpenRouter.
        </p>
      </div>

      <div>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Cole aqui a transcrição da reunião para testar a IA"
          rows={10}
          className="text-sm font-mono"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-[11px] text-muted-foreground">
            {transcript.length.toLocaleString("pt-BR")} caracteres
          </span>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            size="sm"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Gerar Auditoria (Gratuito)</>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold">Relatório da IA</h4>
            <Button size="sm" variant="ghost" onClick={copyResult}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
            </Button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
