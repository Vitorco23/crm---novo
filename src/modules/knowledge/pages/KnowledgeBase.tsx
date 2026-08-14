import { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeRepository } from "../services/KnowledgeRepository";
import { useKnowledgeChunkCounts, useKnowledgeDocuments, useInvalidateKnowledge } from "../hooks/useKnowledge";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { PageHeader } from "@/shared/components/shell/PageHeader";
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

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<KDoc> | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCategoria, setBulkCategoria] = useState<string>("Script");
  const [bulkTags, setBulkTags] = useState<string>("");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const { data: docsData, isLoading: loading, error: docsError } = useKnowledgeDocuments();
  const docs = useMemo(() => (docsData ?? []) as KDoc[], [docsData]);
  const docIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const { data: chunkCountsData } = useKnowledgeChunkCounts(docIds);
  const chunkCounts = chunkCountsData ?? {};
  const invalidateKnowledge = useInvalidateKnowledge();
  const refresh = useCallback(() => { invalidateKnowledge(); }, [invalidateKnowledge]);

  useEffect(() => {
    if (docsError) toast({ title: "Erro ao carregar", description: (docsError as Error).message, variant: "destructive" });
  }, [docsError]);

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
        await KnowledgeRepository.updateDocument(docId, payload);
      } else {
        docId = await KnowledgeRepository.createDocument(payload);
      }
      toast({ title: "Documento salvo. Indexando…" });
      try {
        await KnowledgeRepository.indexDocument(docId);
        toast({ title: "✅ Indexado com sucesso" });
      } catch (idxErr) {
        toast({ title: "Aviso: indexação falhou", description: (idxErr as Error).message, variant: "destructive" });
      }
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
    try {
      await KnowledgeRepository.indexDocument(id);
      toast({ title: "✅ Reindexado" });
      refresh();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este documento? Todos os embeddings serão removidos.")) return;
    try {
      await KnowledgeRepository.deleteDocument(id);
      toast({ title: "Excluído" });
      refresh();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
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
      const data = await KnowledgeRepository.importFile(file.name, b64);
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

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const runBulkImport = async () => {
    if (!bulkFiles.length) { toast({ title: "Selecione ao menos 1 arquivo", variant: "destructive" }); return; }
    const tags = bulkTags.split(",").map((t) => t.trim()).filter(Boolean);
    setBulkProgress({ done: 0, total: bulkFiles.length, current: "" });
    let ok = 0, fail = 0;
    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      setBulkProgress({ done: i, total: bulkFiles.length, current: file.name });
      try {
        const b64 = await fileToBase64(file);
        const imp = await KnowledgeRepository.importFile(file.name, b64);
        const titulo = (imp?.suggestedTitle ?? file.name).slice(0, 120);
        const conteudo = (imp?.text ?? "").trim();
        if (!conteudo) throw new Error("Arquivo sem conteúdo extraível");
        const newId = await KnowledgeRepository.createDocument({
          titulo, categoria: bulkCategoria, descricao: `Importado de ${file.name}`,
          tags, conteudo_markdown: conteudo, ativo: true,
        });
        await KnowledgeRepository.indexDocument(newId);
        ok++;
      } catch (e) {
        fail++;
        console.error("bulk import failed", file.name, e);
        toast({ title: `Falha em ${file.name}`, description: (e as Error).message, variant: "destructive" });
      }
    }
    setBulkProgress(null);
    setBulkFiles([]);
    setBulkOpen(false);
    toast({ title: `Importação concluída`, description: `${ok} sucesso, ${fail} falha(s)` });
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar na base..."
              className="pl-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-xs"
          >
            <option value="all">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex">
            <input
              type="file" accept=".md,.txt,.markdown,.docx,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
            />
            <span>
              <Button asChild size="sm" variant="outline" className="text-xs" disabled={importing}>
                <span className="cursor-pointer">
                  {importing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  Importar
                </span>
              </Button>
            </span>
          </label>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setBulkOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Massa
          </Button>
          <Button size="sm" className="text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando base de conhecimento…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-20 text-center text-muted-foreground">
          <Library className="mx-auto h-10 w-10 mb-4 opacity-20" />
          <p className="text-sm">Nenhum documento encontrado.</p>
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

      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!bulkProgress) setBulkOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar arquivos em massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium mb-1 block">Categoria (aplicada a todos)</label>
              <select
                value={bulkCategoria}
                onChange={(e) => setBulkCategoria(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                disabled={!!bulkProgress}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Tags (opcional, separadas por vírgula)</label>
              <Input
                value={bulkTags}
                onChange={(e) => setBulkTags(e.target.value)}
                placeholder="script, discovery"
                disabled={!!bulkProgress}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Arquivos (.md, .txt, .docx, .pdf)</label>
              <input
                type="file" multiple accept=".md,.txt,.markdown,.docx,.pdf"
                onChange={(e) => setBulkFiles(Array.from(e.target.files ?? []))}
                disabled={!!bulkProgress}
                className="block w-full text-sm"
              />
              {bulkFiles.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{bulkFiles.length} arquivo(s) selecionado(s)</p>
              )}
            </div>
            {bulkProgress && (
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processando {bulkProgress.done + 1}/{bulkProgress.total}: {bulkProgress.current}
                </div>
                <div className="h-1.5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Cada arquivo será importado, salvo como documento na categoria escolhida e indexado automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={!!bulkProgress}>Cancelar</Button>
            <Button onClick={runBulkImport} disabled={!!bulkProgress || bulkFiles.length === 0}>
              {bulkProgress ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando…</> : `Importar ${bulkFiles.length || ""} arquivo(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
