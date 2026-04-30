import { useState } from "react";
import PipelineBoard from "@/components/PipelineBoard";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CalendarPlus } from "lucide-react";
import { addLead, getLeads, type Lead, type ICPStars } from "@/lib/store";
import { toast } from "sonner";

export default function Oportunidades() {
  const [quickOpen, setQuickOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [createdLead, setCreatedLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({
    company: "", contact: "", phone: "", email: "", niche: "", city: "", notes: "",
  });

  const reset = () => setForm({ company: "", contact: "", phone: "", email: "", niche: "", city: "", notes: "" });

  const handleCreateAndSchedule = () => {
    if (!form.company.trim()) {
      toast.error("Informe ao menos a empresa.");
      return;
    }
    // Cria o lead já em "Reunião Marcada" (Oportunidades)
    const created = addLead(
      {
        company: form.company.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        niche: form.niche.trim(),
        city: form.city.trim(),
        gmnLink: "",
        instagramLink: "",
        notes: form.notes.trim(),
        icpStars: 2 as ICPStars,
        runsAds: false,
      },
      "Reunião Marcada"
    );
    // recupera a versão completa (com defaults)
    const full = getLeads().find((l) => l.id === created.id) || created;
    setCreatedLead(full);
    setQuickOpen(false);
    reset();
    setScheduleOpen(true);
  };

  return (
    <>
      <PipelineBoard
        key={refreshKey}
        pipeline="oportunidades"
        title="Oportunidades"
        subtitle="Pipeline de Vendas"
        showAddLead={false}
        showImport={false}
        extraActions={
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setQuickOpen(true)}
          >
            <CalendarPlus className="h-4 w-4 mr-1" /> Nova Oportunidade
          </Button>
        }
      />

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-accent" /> Nova Oportunidade
            </DialogTitle>
            <DialogDescription className="text-xs">
              Crie uma oportunidade já marcando a reunião — ideal para disparos diretos.
              O lead irá direto para <span className="text-accent">Reunião Marcada</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Empresa *</Label>
              <Input
                autoFocus
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contato</Label>
                <Input
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="Nome do decisor"
                />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+55 11 99999-9999"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nicho</Label>
                <Input
                  value={form.niche}
                  onChange={(e) => setForm({ ...form, niche: e.target.value })}
                  placeholder="Ex: Odontologia"
                />
              </div>
              <div>
                <Label className="text-xs">Cidade</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Ex: São Paulo"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <Button
              onClick={handleCreateAndSchedule}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <CalendarPlus className="h-4 w-4 mr-1" /> Criar e marcar reunião
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleMeetingDialog
        lead={createdLead}
        open={scheduleOpen}
        onOpenChange={(o) => {
          setScheduleOpen(o);
          if (!o) {
            setCreatedLead(null);
            setRefreshKey((k) => k + 1);
          }
        }}
        onScheduled={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}
