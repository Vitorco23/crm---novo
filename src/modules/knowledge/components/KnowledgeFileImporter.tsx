import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { KnowledgeRepository } from "../services/KnowledgeRepository";
import { toast } from "sonner";
import { KNOWLEDGE_INGESTION_LIMITS } from "@/../../supabase/functions/_shared/ai-core/knowledge-ingestion";

interface KnowledgeFileImporterProps {
  onImported: (data: { text: string; suggestedTitle: string }) => void;
  disabled?: boolean;
}

// Fallback limits if import fails
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "markdown", "pptx"];

export function KnowledgeFileImporter({ onImported, disabled }: KnowledgeFileImporterProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
      toast.error("Formato não suportado. Use PDF, DOCX, TXT, MD ou PPTX.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      toast.error("Arquivo muito grande. O limite é 15MB.");
      return;
    }

    setLoading(true);
    setStatus('idle');
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          resolve(res.split(",")[1]); // Remove data:URL prefix
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      
      const fileBase64 = await base64Promise;
      const result = await KnowledgeRepository.importFile(file.name, fileBase64);

      if (result.text) {
        onImported({
          text: result.text,
          suggestedTitle: result.suggestedTitle || file.name.replace(/\.[^/.]+$/, "")
        });
        setStatus('success');
        toast.success("Documento importado. Revise o conteúdo antes de salvar.");
      } else {
        throw new Error("Não foi possível extrair o conteúdo deste arquivo.");
      }
    } catch (error) {
      console.error("Import error:", error);
      setStatus('error');
      toast.error(error instanceof Error ? error.message : "Erro ao importar arquivo.");
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3 p-4 border-2 border-dashed rounded-lg bg-accent/5 border-accent/20">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4" /> Importar documento
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Formatos suportados: PDF, DOCX, TXT, MD e PPTX
          </p>
        </div>
        <div className="relative">
          <Input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            accept=".pdf,.docx,.txt,.md,.markdown,.pptx"
            onChange={handleFileChange}
            disabled={disabled || loading}
          />
          <Button variant="outline" size="sm" className="pointer-events-none" disabled={disabled || loading}>
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Extraindo...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5 mr-2" />
                Selecionar arquivo
              </>
            )}
          </Button>
        </div>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-500 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Documento importado com sucesso. Título e conteúdo foram preenchidos abaixo.</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-[11px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Não foi possível extrair o conteúdo deste arquivo.</span>
        </div>
      )}
    </div>
  );
}
