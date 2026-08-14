import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Save, Search, Sparkles, BookMarked, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listMemories,
  updateMemory,
  deleteMemory,
  consolidateNicheInsights,
  MEMORY_KIND_LABELS,
  type CommercialMemory,
  type MemoryKind,
} from "@/modules/intelligence/services/commercialMemory";
import { getLeads } from "@/shared/services/store";

const KIND_COLORS: Record<MemoryKind, string> = {
  won_pattern: "bg-green-500/10 text-green-600 border-green-500/30",
  lost_pattern: "bg-red-500/10 text-red-600 border-red-500/30",
  objection_handled: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  niche_insight: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  sequence_insight: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

export default function MemoriaComercial() {
  const [items, setItems] = useState<CommercialMemory[]>([]);
  const [kind, setKind] = useState<MemoryKind | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [consolidating, setConsolidating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; content: string }>({ title: "", content: "" });

  async function refresh() {
    setLoading(true);
    const data = await listMemories();
    setItems(data);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (q && !m.title.toLowerCase().includes(q) && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, kind, search]);

  const counters = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const m of items) c[m.kind] = (c[m.kind] || 0) + 1;
    return c;
  }, [items]);

  async function handleConsolidate() {
    setConsolidating(true);
    try {
      const leads = await getLeads();
      const n = await consolidateNicheInsights(leads);
      toast.success(n > 0
        ? `Consolidando ${n} nichos com IA em segundo plano...`
        : "Ainda não há nichos com leads suficientes (mínimo 5).");
      setTimeout(refresh, 4000);
    } catch (e) {
      toast.error("Falha ao consolidar: " + (e as Error).message);
    } finally {
      setConsolidating(false);
    }
  }

  function startEdit(m: CommercialMemory) {
    setEditing(m.id);
    setDraft({ title: m.title, content: m.content });
  }
  async function saveEdit() {
    if (!editing) return;
    try {
      await updateMemory(editing, draft);
      toast.success("Memória atualizada.");
      setEditing(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function toggleApproval(m: CommercialMemory) {
    try {
      await updateMemory(m.id, { approved: !m.approved });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(id: string) {
    if (!confirm("Excluir esta memória?")) return;
    try { await deleteMemory(id); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar memórias..."
              className="pl-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" className="text-xs" onClick={handleConsolidate} disabled={consolidating}>
            <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${consolidating ? "animate-pulse" : ""}`} />
            Consolidar aprendizados
          </Button>
        </div>
      </div>


      <Tabs value={kind} onValueChange={(v) => setKind(v as MemoryKind | "all")}>
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="all" className="text-xs py-1.5">Todas ({counters.all || 0})</TabsTrigger>
          {(Object.keys(MEMORY_KIND_LABELS) as MemoryKind[]).map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs py-1.5">
              {MEMORY_KIND_LABELS[k]} ({counters[k] || 0})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>


      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Nenhuma memória ainda. Elas serão criadas automaticamente quando você ganhar ou perder leads,
            ou clique em <b>Consolidar aprendizados agora</b>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m) => (
            <Card key={m.id} className={m.approved ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={KIND_COLORS[m.kind as MemoryKind]}>
                      {MEMORY_KIND_LABELS[m.kind as MemoryKind]}
                    </Badge>
                    {(m.metadata?.niche as string) && (
                      <Badge variant="secondary" className="text-xs">{m.metadata.niche as string}</Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      Usada {m.usage_count}× · {new Date(m.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleApproval(m)}>
                      {m.approved ? "Aprovada" : "Reprovada"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {editing === m.id ? (
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2" />
                ) : (
                  <CardTitle className="text-base cursor-pointer" onClick={() => startEdit(m)}>{m.title}</CardTitle>
                )}
              </CardHeader>
              <CardContent>
                {editing === m.id ? (
                  <div className="space-y-2">
                    <Textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={4} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit}><Save className="h-3 w-3 mr-1" />Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap cursor-pointer" onClick={() => startEdit(m)}>
                    {m.content}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
