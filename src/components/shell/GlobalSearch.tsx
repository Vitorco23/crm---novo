import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS, NAV_GROUPS, NavGroupId } from "@/lib/navigation";

/**
 * Busca global (estrutura visual apenas nesta sprint).
 * Atalho: ⌘K / Ctrl+K. Navega para as páginas do shell; a integração com dados
 * de negócio (leads, tarefas etc.) será conectada nas próximas sprints.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = (Object.keys(NAV_GROUPS) as NavGroupId[]).map((gid) => ({
    id: gid,
    label: NAV_GROUPS[gid].label,
    items: NAV_ITEMS.filter((n) => n.group === gid),
  }));

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 px-2.5 text-muted-foreground hover:text-foreground w-full md:w-[240px] justify-start"
        title="Buscar (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-label hidden md:inline">Buscar em tudo…</span>
        <span className="text-label md:hidden">Buscar</span>
        <kbd className="ml-auto hidden md:inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ir para uma página, buscar leads, tarefas…" />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          {grouped.map((g, idx) => (
            g.items.length > 0 && (
              <div key={g.id}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={g.label}>
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.url}
                        value={`${item.title} ${item.description ?? ""}`}
                        onSelect={() => {
                          navigate(item.url);
                          setOpen(false);
                        }}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.title}</span>
                        {item.description && (
                          <span className="ml-auto text-caption text-muted-foreground">{item.description}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            )
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
