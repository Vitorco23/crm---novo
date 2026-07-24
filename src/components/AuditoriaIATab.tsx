import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface Props {
  leadCompany: string;
}

const SYSTEM_PROMPT =
  "Você é o Diretor Comercial da agência Performance21. Sua função é auditar a transcrição de uma reunião de vendas e extrair os dados frios. Leia a transcrição e devolva um relatório rápido em tópicos curtos: 1. BANT (Foi validado?), 2. Ralo Comercial (Qual o gargalo?), 3. Objeções (Quais foram e como contornadas?), 4. Próximo Passo.";

const KEY_STORAGE = "p21_openrouter_key";
const MODEL_STORAGE = "p21_openrouter_model";
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1:free";
const MODEL_PRESETS: { label: string; value: string }[] = [
  { label: "DeepSeek V3.1 (free)", value: "deepseek/deepseek-chat-v3.1:free" },
  { label: "GLM 4.5 Air (free)", value: "z-ai/glm-4.5-air:free" },
  { label: "Llama 3.3 70B (free)", value: "meta-llama/llama-3.3-70b-instruct:free" },
  { label: "GPT-4o mini (pago)", value: "openai/gpt-4o-mini" },
  { label: "Gemini 2.5 Flash (pago)", value: "google/gemini-2.5-flash" },
];

export default function AuditoriaIATab({ leadCompany }: Props) {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const k = localStorage.getItem(KEY_STORAGE) || "";
    const m = localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
    setApiKey(k);
    setModel(m);
    if (!k) setShowKey(true);
  }, []);

  const saveKey = () => {
    localStorage.setItem(KEY_STORAGE, apiKey.trim());
    localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
    setShowKey(false);
    toast.success("Chave salva no navegador");
  };

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      toast.error("Cole sua chave do OpenRouter primeiro.");
      setShowKey(true);
      return;
    }
    if (!transcript.trim()) {
      toast.error("Cole a transcrição da reunião antes de gerar a auditoria.");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "CRM Performance21 - Auditoria IA",
        },
        body: JSON.stringify({
          model: model.trim() || DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: transcript },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `Erro ${res.status}`);
      }
      const content = data?.choices?.[0]?.message?.content ?? "Sem resposta da IA.";
      setResult(content);
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
          objeções e próximo passo. Chamada direta do navegador (modo teste).
        </p>
        <p className="text-[11px] text-amber-500 mt-1">
          ⚠️ Sua chave fica no localStorage e é enviada do navegador — não use em produção pública.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium">
            <KeyRound className="h-3.5 w-3.5" />
            Configuração OpenRouter
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? "Ocultar" : apiKey ? "Alterar chave" : "Configurar"}
          </Button>
        </div>
        {showKey && (
          <div className="space-y-2">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="text-xs font-mono"
            />
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL}
              className="text-xs font-mono"
            />
            <Button size="sm" onClick={saveKey} className="w-full">
              Salvar
            </Button>
          </div>
        )}
        {!showKey && apiKey && (
          <p className="text-[11px] text-muted-foreground">
            Chave configurada · Modelo: <span className="font-mono">{model}</span>
          </p>
        )}
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
              <><Sparkles className="h-4 w-4 mr-1" /> Gerar Auditoria</>
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
