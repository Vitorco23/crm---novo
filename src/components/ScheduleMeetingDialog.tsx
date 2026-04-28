import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarCheck } from "lucide-react";
import { scheduleMeeting, type Lead, type Meeting } from "@/lib/store";
import { toast } from "sonner";

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

const todayISO = () => new Date().toISOString().split("T")[0];

export default function ScheduleMeetingDialog({ lead, open, onOpenChange, onScheduled }: Props) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("10:00");
  const [contactName, setContactName] = useState("");
  const [channel, setChannel] = useState<NonNullable<Meeting["channel"]>>("Google Meet");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  if (!lead) return null;

  const handleConfirm = () => {
    if (!date || !time) {
      toast.error("Informe data e horário.");
      return;
    }
    try {
      const { autoTransfer } = scheduleMeeting(lead.id, {
        date, time, contactName: contactName.trim() || lead.contact,
        channel, link: link.trim(), notes: notes.trim(),
      });
      toast.success(
        `Reunião agendada para ${new Date(date + "T" + time).toLocaleString("pt-BR")}`,
        { description: autoTransfer ? "Lead movido para Oportunidades → Reunião Marcada" : "Lead movido para Reunião Marcada" }
      );
      onOpenChange(false);
      onScheduled?.();
      // reset
      setContactName(""); setLink(""); setNotes("");
    } catch (e) {
      toast.error("Erro ao agendar reunião");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-accent" /> Marcar Reunião
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-medium text-foreground">{lead.company}</span> será movido para{" "}
            <span className="text-accent">Oportunidades → Reunião Marcada</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Horário *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Contato</Label>
            <Input
              placeholder={lead.contact || "Nome do decisor"}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as NonNullable<Meeting["channel"]>)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Google Meet">Google Meet</SelectItem>
                <SelectItem value="Zoom">Zoom</SelectItem>
                <SelectItem value="Telefone">Telefone</SelectItem>
                <SelectItem value="Presencial">Presencial</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Link / Endereço</Label>
            <Input
              placeholder="https://meet.google.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Pauta / Observações</Label>
            <Textarea
              placeholder="Tópicos a abordar, dores levantadas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleConfirm}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <CalendarCheck className="h-4 w-4 mr-1" /> Confirmar e Mover para Oportunidades
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
