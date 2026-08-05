import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2 } from "lucide-react";
import { uload, usave } from "@/shared/services/userStorage";
import { toast } from "sonner";

interface LostReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  pipeline: "cold_call" | "oportunidades";
}

const STORAGE_KEY_COLD = "p21_lost_reasons_cold_call";
const STORAGE_KEY_OPP = "p21_lost_reasons_oportunidades";

const DEFAULT_REASONS_COLD = [
  "Já possui agência",
  "Sem tempo/prioridade",
  "Orçamento baixo",
  "Não atendeu/Sem contato",
  "Não tem interesse no momento",
];

const DEFAULT_REASONS_OPP = [
  "Preço alto",
  "Escolheu concorrente",
  "Projeto cancelado",
  "Sem fit técnico",
  "Não respondeu após proposta",
];

export default function LostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  pipeline,
}: LostReasonDialogProps) {
  const storageKey = pipeline === "cold_call" ? STORAGE_KEY_COLD : STORAGE_KEY_OPP;
  const defaultReasons = pipeline === "cold_call" ? DEFAULT_REASONS_COLD : DEFAULT_REASONS_OPP;

  const [reasons, setReasons] = useState<string[]>(() => uload(storageKey, defaultReasons));
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [newReason, setNewReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (open) {
      setReasons(uload(storageKey, defaultReasons));
      setSelectedReason("");
      setIsEditing(false);
    }
  }, [open, storageKey, defaultReasons]);

  const handleAddReason = () => {
    if (!newReason.trim()) return;
    if (reasons.includes(newReason.trim())) {
      toast.error("Este motivo já existe");
      return;
    }
    const next = [...reasons, newReason.trim()];
    setReasons(next);
    usave(storageKey, next);
    setNewReason("");
  };

  const handleRemoveReason = (reason: string) => {
    const next = reasons.filter((r) => r !== reason);
    setReasons(next);
    usave(storageKey, next);
    if (selectedReason === reason) setSelectedReason("");
  };

  const handleConfirm = () => {
    if (!selectedReason) {
      toast.error("Por favor, selecione um motivo");
      return;
    }
    onConfirm(selectedReason);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#152039] text-white border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl">Por que este lead foi perdido?</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Selecione o motivo
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] h-6 px-2 hover:bg-white/5"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? "Concluir" : "Editar Lista"}
            </Button>
          </div>

          <RadioGroup
            value={selectedReason}
            onValueChange={setSelectedReason}
            className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin"
          >
            {reasons.map((reason) => (
              <div
                key={reason}
                className="flex items-center justify-between group rounded-lg border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <RadioGroupItem value={reason} id={reason} className="border-accent text-accent" />
                  <Label
                    htmlFor={reason}
                    className="flex-1 cursor-pointer text-sm font-medium"
                  >
                    {reason}
                  </Label>
                </div>
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveReason(reason);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </RadioGroup>

          {isEditing && (
            <div className="flex gap-2 pt-2 border-t border-white/10">
              <Input
                placeholder="Novo motivo..."
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="bg-white/5 border-white/10 text-sm h-9 focus:ring-accent"
                onKeyDown={(e) => e.key === "Enter" && handleAddReason()}
              />
              <Button size="sm" onClick={handleAddReason} className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-white/10">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="hover:bg-white/5 text-white"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Confirmar Perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
