import { useState, useEffect } from "react";
import PipelineBoard from "@/modules/pipeline/components/PipelineBoard";
import ScheduleMeetingDialog from "@/modules/leads/components/ScheduleMeetingDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CalendarPlus, Inbox, Loader2 } from "lucide-react";
import { addLead, getLeads, type Lead, type ICPStars } from "@/shared/services/store";
import { pullInboundLeads } from "@/shared/services/userStorage";
import { toast } from "sonner";


export default function Oportunidades() {
  const [quickOpen, setQuickOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [createdLead, setCreatedLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [form, setForm] = useState({
    company: "", contact: "", phone: "", email: "", niche: "", city: "", notes: "",
  });

  useEffect(() => {
    const onLeadsChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener("p21:leads-changed", onLeadsChanged);
    return () => window.removeEventListener("p21:leads-changed", onLeadsChanged);
  }, []);

  const handlePullInbound = async () => {
    if (pulling) return;
    setPulling(true);
    try {
      const n = await pullInboundLeads();
      if (n > 0) {
        toast.success(`${n} registro${n > 1 ? "s" : ""} processado${n > 1 ? "s" : ""} da Landing Page`);
        setRefreshKey((k) => k + 1);
      } else {
        toast("Nenhum lead novo na caixa de entrada");
      }
    } catch (e: any) {
      console.error("[pullInboundLeads]", e);
      toast.error("Falha ao buscar leads da Landing Page");
    } finally {
      setPulling(false);
    }
  };


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
        stage: "Reunião Marcada"
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePullInbound}
              disabled={pulling}
              title="Buscar leads da Landing Page"
            >
              {pulling
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Inbox className="h-4 w-4 mr-1" />}
              Caixa de entrada
            </Button>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => setQuickOpen(true)}
            >
              <CalendarPlus className="h-4 w-4 mr-1" /> Nova Oportunidade
            </Button>
          </div>
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
