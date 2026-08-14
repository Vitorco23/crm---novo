import { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeRepository } from "../services/KnowledgeRepository";
import { useKnowledgeChunkCounts, useKnowledgeDocuments, useInvalidateKnowledge } from "../hooks/useKnowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Library, Plus, Upload, Trash2, Pencil, Loader2, RefreshCw, CheckCircle2, Search, Info } from "lucide-react";

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

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<KDoc> | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: docsData, isLoading: loading } = useKnowledgeDocuments();
  const docs = useMemo(() => (docsData ?? []) as KDoc[], [docsData]);
  const docIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const { data: chunkCountsData } = useKnowledgeChunkCounts(docIds);
  const chunkCounts = chunkCountsData ?? {};
  const invalidateKnowledge = useInvalidateKnowledge();
  const refresh = useCallback(() => { invalidateKnowledge(); }, [invalidateKnowledge]);

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
    if (!titulo) { toast.error("Título obrigatório"); return; }
    if (!conteudo) { toast.error("Conteúdo vazio"); return; }
    setSaving(true);
    try {
      const payload = {
        titulo,
        categoria: editing.categoria ?? "Outro",
        descricao: editing.descricao ?? null,
        tags: editing.tags ?? [],
        conteudo_markdown: conteudo,
        ativo: editing.ativo ?? true,
      };
      if (editing.id) await KnowledgeRepository.updateDocument(editing.id, payload);
      else await KnowledgeRepository.createDocument(payload);
      toast.success("Documento salvo.");
      setEditorOpen(false);
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    try {
      await KnowledgeRepository.deleteDocument(id);
      toast.success("Excluído");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
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
        <Button size="sm" className="text-xs" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => (
            <Card key={d.id} className="p-4 hover:border-accent/40 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold text-sm leading-tight mb-1">{d.titulo}</h3>
                  {d.descricao && <p className="text-[11px] text-muted-foreground">{d.descricao}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(d.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Badge variant={d.categoria === "Objeções" ? "default" : "secondary"}>{d.categoria}</Badge>
                <span className="ml-auto">{new Date(d.updated_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Novo"} item</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Input value={editing.titulo} placeholder="Título" onChange={(e) => setEditing({...editing, titulo: e.target.value})} />
                <select value={editing.categoria} onChange={(e) => setEditing({...editing, categoria: e.target.value})} className="rounded-md border bg-background px-3 text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Textarea value={editing.conteudo_markdown} placeholder="Markdown..." className="h-64 font-mono text-xs" onChange={(e) => setEditing({...editing, conteudo_markdown: e.target.value})} />
              <DialogFooter>
                <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
