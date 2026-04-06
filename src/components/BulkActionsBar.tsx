import { useState } from "react";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, X } from "lucide-react";

export default function BulkActionsBar({
  count,
  onMoveToStage,
  onClear,
}: {
  count: number;
  onMoveToStage: (stage: PipelineStage) => void;
  onClear: () => void;
}) {
  const [targetStage, setTargetStage] = useState<string>("");

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-lg px-4 py-2 mb-3 animate-slide-in">
      <span className="text-sm font-medium text-foreground">
        {count} lead{count > 1 ? "s" : ""} selecionado{count > 1 ? "s" : ""}
      </span>

      <div className="flex items-center gap-2 ml-auto">
        <Select value={targetStage} onValueChange={setTargetStage}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Mover para etapa..." />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage} className="text-xs">
                {stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 text-xs"
          disabled={!targetStage}
          onClick={() => {
            if (targetStage) {
              onMoveToStage(targetStage as PipelineStage);
              setTargetStage("");
            }
          }}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Mover
        </Button>

        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
