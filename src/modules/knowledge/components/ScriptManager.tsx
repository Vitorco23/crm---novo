import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlaskConical, Pencil, Trash2, Plus, Check, X, RefreshCw } from "lucide-react";
import { getScripts, addScript, renameScript, removeScript } from "@/modules/knowledge/services/scripts";
import { toast } from "sonner";
import { syncFromCloud } from "@/shared/services/userStorage";


export default function ScriptManager() {
  const [scripts, setScripts] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [syncing, setSyncing] = useState(false);

  const refresh = () => setScripts(getScripts());

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFromCloud();
      refresh();
      toast("Scripts sincronizados", { description: "Os dados foram atualizados com a nuvem." });
    } catch (error) {
      toast.error("Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  };


  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("p21:scripts-changed", handler);
    return () => window.removeEventListener("p21:scripts-changed", handler);
  }, []);

  const handleAdd = () => {
    const r = addScript(newName);
    if (!r.ok) return toast.error("Não foi possível adicionar", { description: r.error });
    setNewName("");
    toast("Script adicionado");
  };

  const handleRename = (oldName: string) => {
    const r = renameScript(oldName, editValue);
    if (!r.ok) return toast.error("Não foi possível renomear", { description: r.error });
    setEditing(null);
    setEditValue("");
    toast("Script renomeado", { description: "Histórico atualizado automaticamente." });
  };

  const handleRemove = (name: string) => {
    if (!confirm(`Remover "${name}" da lista? O histórico é preservado.`)) return;
    const r = removeScript(name);
    if (!r.ok) return toast.error("Não foi possível remover", { description: r.error });
    toast("Script removido");
  };

  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Gerenciar Scripts</CardTitle>
            <CardDescription>
              Renomeie, adicione ou remova scripts de abordagem. Renomear preserva o histórico de ligações e sessões.
            </CardDescription>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSync} 
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          {scripts.map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              {editing === s ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(s); if (e.key === "Escape") { setEditing(null); setEditValue(""); } }}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleRename(s)} title="Salvar">
                    <Check className="h-4 w-4 text-accent" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(null); setEditValue(""); }} title="Cancelar">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{s}</span>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(s); setEditValue(s); }} title="Renomear">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(s)}
                    disabled={scripts.length <= 1}
                    title={scripts.length <= 1 ? "Precisa existir ao menos 1 script" : "Remover"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            placeholder="Nome do novo script (ex: Script 1, Abordagem Curta...)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="h-9"
          />
          <Button onClick={handleAdd} size="sm" className="h-9 gap-1">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
