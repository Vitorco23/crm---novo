import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/shell/PageContainer";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Library, Plus, Upload, Trash2, Pencil, Loader2, RefreshCw, FileText, CheckCircle2 } from "lucide-react";

const CATEGORIES = [
  "Metodologia",
  "Playbook",
  "Script",
  "Cadência",
  "ICP",
  "Objeções",
  "Onboarding",
  "Comercial",
  "Outro",
] as const;

interface KDoc {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string | null;
  tags: string[];
  conteudo_markdown: string;
  versao: number;
  ativo: boolean;
  updated_at: string;
}

interface ChunkStats { document_id: string; total: number }

function useChunkCounts(docs: KDoc[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!docs.length) return;
    supabase
      .from("knowledge_chunks")
      .select("document_id")
      .in("document_id", docs.map((d) => d.id))
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data ?? []).forEach((r: any) => { map[r.document_id] = (map[r.document_id] ?? 0) + 1; });
        setCounts(map);
      });
  }, [docs]);
  return counts;
}

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<KDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<KDoc> | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const chunkCounts = useChunkCounts(docs);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    else setDocs((data ?? []) as KDoc[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filterCat !== "all" && d.categoria !== filterCat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return d.titulo.toLowerCase().includes(q)
        || (d.descricao ?? "").toLowerCase().includes(q)
        || (d.tags ?? []).some((t) => t.toLowerCase().includes(q));
    });
  }, [docs, search, filterCat]);

  const openNew = () => {
    setEditing({ titulo: "", categoria: "Metodologia", descricao: "", tags: [], conteudo_markdown: "", ativo: true });
    setEditorOpen(true);
  };
  const openEdit = (d: KDoc) => {
    setEditing({ ...d });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    const titulo = (editing.titulo ?? "").trim();
    const conteudo = (editing.conteudo_markdown ?? "").trim();
    if (!titulo) { toast({ title: "Título obrigatório", variant: "destructive" }); return; }
    if (!conteudo) { toast({ title: "Conteúdo vazio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let docId = editing.id;
      const payload = {
        titulo,
        categoria: editing.categoria ?? "Outro",
        descricao: editing.descricao ?? null,
        tags: editing.tags ?? [],
        conteudo_markdown: conteudo,
        ativo: editing.ativo ?? true,
      };
      if (docId) {
        // Trigger no banco snapshotta versão anterior e incrementa `versao` automaticamente.
        const { error } = await supabase
          .from("knowledge_documents")
          .update(payload)
          .eq("id", docId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("knowledge_documents").insert(payload).select("id").single();
        if (error) throw error;
        docId = data.id;
      }
      toast({ title: "Documento salvo. Indexando…" });
      const { error: idxErr } = await supabase.functions.invoke("knowledge-index", { body: { documentId: docId } });
      if (idxErr) toast({ title: "Aviso: indexação falhou", description: idxErr.message, variant: "destructive" });
      else toast({ title: "✅ Indexado com sucesso" });
      setEditorOpen(false);
      setEditing(null);
      refresh();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reindex = async (id: string) => {
    toast({ title: "Reindexando…" });
    const { error } = await supabase.functions.invoke("knowledge-index", { body: { documentId: id } });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ Reindexado" }); refresh(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este documento? Todos os embeddings serão removidos.")) return;
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Excluído" }); refresh(); }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("knowledge-import", {
        body: { filename: file.name, fileBase64: b64 },
      });
      if (error) throw error;
      setEditing({
        titulo: data.suggestedTitle ?? file.name,
        categoria: "Metodologia",
        descricao: `Importado de ${file.name}`,
        tags: [],
        conteudo_markdown: data.text ?? "",
        ativo: true,
      });
      setEditorOpen(true);
      toast({ title: "✅ Importado", description: `${data.chars} caracteres extraídos. Revise e salve.` });
    } catch (e) {
      toast({ title: "Erro na importação", description: (e as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Knowledge Base"
        description="Documentação oficial da Performance21 usada pelo Mentor P21 (RAG semântico)"
        icon={Library}
        actions={
          <div className="flex gap-2">
            <label className="inline-flex">
              <input
                type="file" accept=".md,.txt,.markdown,.docx,.pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
              />
              <span>
                <Button asChild size="sm" variant="outline" disabled={importing}>
                  <span className="cursor-pointer">
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Importar arquivo
                  </span>
                </Button>
              </span>
            </label>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo documento</Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Buscar por título, descrição ou tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando documentos…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum documento. Crie manualmente ou importe um arquivo (.md, .txt, .docx, .pdf).
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((d) => (
            <Card key={d.id} className="p-4 hover:border-primary/40 transition">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium truncate">{d.titulo}</h3>
                  {d.descricao && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.descricao}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(d)} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => reindex(d.id)} title="Reindexar">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(d.id)} title="Excluir">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="secondary">{d.categoria}</Badge>
                <Badge variant="outline">v{d.versao}</Badge>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {chunkCounts[d.id] ?? 0} chunks
                </Badge>
                {(d.tags ?? []).map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
                <span className="text-muted-foreground ml-auto">
                  {new Date(d.updated_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={(o) => { setEditorOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar documento" : "Novo documento"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Título</label>
                <Input
                  value={editing.titulo ?? ""}
                  onChange={(e) => setEditing({ ...editing, titulo: e.target.value })}
                  placeholder="Ex.: Playbook Discovery — Gestores de Marketing"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Categoria</label>
                  <select
                    value={editing.categoria ?? "Outro"}
                    onChange={(e) => setEditing({ ...editing, categoria: e.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Tags (separadas por vírgula)</label>
                  <Input
                    value={(editing.tags ?? []).join(", ")}
                    onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    placeholder="spin, discovery, gestor"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Descrição curta</label>
                <Input
                  value={editing.descricao ?? ""}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                  placeholder="Uma linha explicando quando usar este documento"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Conteúdo (Markdown) · {(editing.conteudo_markdown ?? "").length} caracteres
                </label>
                <Textarea
                  value={editing.conteudo_markdown ?? ""}
                  onChange={(e) => setEditing({ ...editing, conteudo_markdown: e.target.value })}
                  className="font-mono text-xs min-h-[300px]"
                  placeholder="# Título&#10;&#10;## Contexto&#10;..."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ao salvar, o conteúdo é dividido em chunks e vetorizado automaticamente para busca semântica.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando & indexando…</> : "Salvar e indexar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
