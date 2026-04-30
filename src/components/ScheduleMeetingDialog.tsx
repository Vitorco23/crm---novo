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
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button as UIButton } from "@/components/ui/button";
import { CalendarCheck, CalendarIcon, Loader2, Video } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { scheduleMeeting, type Lead, type Meeting } from "@/lib/store";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

const todayISO = () => new Date().toISOString().split("T")[0];
const browserTZ = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function ScheduleMeetingDialog({ lead, open, onOpenChange, onScheduled }: Props) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30"); // minutes
  const [contactName, setContactName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [channel, setChannel] = useState<NonNullable<Meeting["channel"]>>("Google Meet");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!lead) return null;

  const handleConfirm = async () => {
    if (!date || !time) {
      toast.error("Informe data e horário.");
      return;
    }
    if (syncToGoogle && attendeeEmail && !isEmail(attendeeEmail)) {
      toast.error("E-mail do lead inválido.");
      return;
    }

    setSubmitting(true);
    let googleData: { eventId?: string; htmlLink?: string; meetLink?: string } = {};

    if (syncToGoogle) {
      try {
        const start = new Date(`${date}T${time}:00`);
        const end = new Date(start.getTime() + parseInt(duration) * 60 * 1000);
        const description = [
          `Empresa: ${lead.company}`,
          (contactName.trim() || lead.contact) && `Contato: ${contactName.trim() || lead.contact}`,
          lead.phone && `Telefone: ${lead.phone}`,
          lead.niche && `Nicho: ${lead.niche}`,
          lead.city && `Cidade: ${lead.city}`,
          notes.trim() && `\nObservações:\n${notes.trim()}`,
        ].filter(Boolean).join("\n");

        const { data, error } = await supabase.functions.invoke("create-google-meeting", {
          body: {
            summary: `Reunião de diagnóstico - ${lead.company}`,
            description,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            timeZone: browserTZ(),
            attendeeEmail: attendeeEmail.trim() || undefined,
            withMeet: channel === "Google Meet",
          },
        });

        if (error) throw error;
        if (data?.error) {
          if (data.error === "google_calendar_not_connected") {
            toast.warning("Google Agenda não conectado", {
              description: "Reunião salva localmente. Conecte sua agenda em Configurações.",
            });
          } else {
            toast.warning("Falha ao criar evento no Google", {
              description: data.details || data.error,
            });
          }
        } else {
          googleData = {
            eventId: data?.eventId,
            htmlLink: data?.htmlLink,
            meetLink: data?.meetLink,
          };
        }
      } catch (e) {
        console.error(e);
        toast.warning("Não foi possível sincronizar com Google Agenda", {
          description: "A reunião será salva localmente.",
        });
      }
    }

    try {
      const { autoTransfer } = scheduleMeeting(lead.id, {
        date,
        time,
        contactName: contactName.trim() || lead.contact,
        channel,
        link: googleData.meetLink || link.trim(),
        notes: notes.trim(),
        attendeeEmail: attendeeEmail.trim() || undefined,
        googleEventId: googleData.eventId,
        googleEventUrl: googleData.htmlLink,
        meetLink: googleData.meetLink,
      });
      toast.success(
        `Reunião agendada para ${new Date(date + "T" + time).toLocaleString("pt-BR")}`,
        {
          description: googleData.eventId
            ? "Evento criado no Google Agenda e convite enviado!"
            : autoTransfer
              ? "Lead movido para Oportunidades → Reunião Marcada"
              : "Lead movido para Reunião Marcada",
        }
      );
      onOpenChange(false);
      onScheduled?.();
      // reset
      setContactName(""); setAttendeeEmail(""); setLink(""); setNotes("");
    } catch (e) {
      toast.error("Erro ao agendar reunião");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Label className="text-xs">Data *</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <UIButton
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      title="Abrir calendário"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </UIButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={ptBR}
                      selected={date ? parseISO(date) : undefined}
                      onSelect={(d) => {
                        if (d) setDate(format(d, "yyyy-MM-dd"));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="col-span-1">
              <Label className="text-xs">Horário *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="col-span-1">
              <Label className="text-xs">Duração</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h 30min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contato</Label>
              <Input
                placeholder={lead.contact || "Nome do decisor"}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">E-mail do lead {syncToGoogle && "*"}</Label>
              <Input
                type="email"
                placeholder="lead@empresa.com"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as NonNullable<Meeting["channel"]>)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Google Meet">Google Meet (gera link automático)</SelectItem>
                <SelectItem value="Zoom">Zoom</SelectItem>
                <SelectItem value="Telefone">Telefone</SelectItem>
                <SelectItem value="Presencial">Presencial</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel !== "Google Meet" && (
            <div>
              <Label className="text-xs">Link / Endereço</Label>
              <Input
                placeholder="https://zoom.us/... ou endereço"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Pauta / Observações</Label>
            <Textarea
              placeholder="Tópicos a abordar, dores levantadas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-accent" />
              <div>
                <Label className="text-sm cursor-pointer">Sincronizar com Google Agenda</Label>
                <p className="text-[10px] text-muted-foreground">
                  Cria o evento na sua agenda e envia convite ao lead
                </p>
              </div>
            </div>
            <Switch checked={syncToGoogle} onCheckedChange={setSyncToGoogle} />
          </div>

          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Agendando...</>
            ) : (
              <><CalendarCheck className="h-4 w-4 mr-1" /> Confirmar Reunião</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
