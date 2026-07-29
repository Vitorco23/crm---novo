import { BookMarked } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MEMORY_KIND_LABELS, type MemoryKind } from "@/modules/intelligence/services/commercialMemory";

export interface MemoryRef {
  id: string;
  kind: MemoryKind;
  title: string;
  similarity: number;
}

export function MemoryReferencesBlock({ references }: { references?: MemoryRef[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
        <BookMarked className="h-3.5 w-3.5" />
        Baseado em {references.length} {references.length === 1 ? "memória" : "memórias"} da Performance21
      </div>
      <div className="space-y-1.5">
        {references.map((r) => (
          <div key={r.id} className="flex items-start gap-2 text-xs">
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {MEMORY_KIND_LABELS[r.kind] || r.kind}
            </Badge>
            <span className="text-muted-foreground">{r.title}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
              {(r.similarity * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
