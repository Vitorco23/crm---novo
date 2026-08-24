import { useState, useEffect } from "react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Users, UserCheck, CalendarCheck, FileText, Ban, ListTodo } from "lucide-react";
import { getScripts, getSelectedScript, setSelectedScript, type ScriptOption } from "@/modules/knowledge/services/scripts";

export function PomodoroSessionFormDialog() {
  const { showForm, submitForm, dismissForm, state } = usePomodoro();
  const [scripts, setScripts] = useState<string[]>(() => getScripts());
  const [form, setForm] = useState({ 
    calls: 0, 
    connections: 0, 
    decisionMakers: 0, 
    meetings: 0, 
    r1: 0, 
    followsToDo: 0, 
    negatives: 0, 
    niche: "", 
    scriptUsed: getScripts()[0] as ScriptOption 
  });


  useEffect(() => {
    const refresh = () => setScripts(getScripts());
    window.addEventListener("p21:scripts-changed", refresh);
    return () => window.removeEventListener("p21:scripts-changed", refresh);
  }, []);

  useEffect(() => {
    if (showForm) setForm({
      calls: state.tally?.calls ?? 0,
      connections: state.tally?.connections ?? 0,
      decisionMakers: state.tally?.decisionMakers ?? 0,
      meetings: state.tally?.meetings ?? 0,
      r1: state.tally?.r1 ?? 0,
      followsToDo: state.tally?.followsToDo ?? 0,
      negatives: state.tally?.negatives ?? 0,

      niche: state.niche || "",
      scriptUsed: getSelectedScript(),
    });
  }, [showForm, state.niche, state.tally]);

  return (
    <Dialog open={showForm} onOpenChange={(open) => { if (!open) dismissForm(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Sessão de Outreach</DialogTitle>
          <DialogDescription className="text-xs">
            Pomodoro de {Math.round(state.actualDurationSec / 60)}min finalizado. Registre os números para mapear seus melhores horários por nicho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nicho trabalhado</Label>
            <Input
              placeholder="Ex: Odontologia, Advocacia..."
              value={form.niche}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Script utilizado</Label>
            <Select
              value={form.scriptUsed}
              onValueChange={(v) => {
                const s = v as ScriptOption;
                setForm({ ...form, scriptUsed: s });
                setSelectedScript(s);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {scripts.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Ligações</Label>
              <Input type="number" min={0} value={form.calls}
                onChange={(e) => setForm({ ...form, calls: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Conexões</Label>
              <Input type="number" min={0} value={form.connections}
                onChange={(e) => setForm({ ...form, connections: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><UserCheck className="h-3 w-3" /> Decisores</Label>
              <Input type="number" min={0} value={form.decisionMakers}
                onChange={(e) => setForm({ ...form, decisionMakers: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Reuniões</Label>
              <Input type="number" min={0} value={form.meetings}
                onChange={(e) => setForm({ ...form, meetings: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Zap className="h-3 w-3" /> R1</Label>
              <Input type="number" min={0} value={form.r1}
                onChange={(e) => setForm({ ...form, r1: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><ListTodo className="h-3 w-3" /> Follows a fazer</Label>
              <Input type="number" min={0} value={form.followsToDo}
                onChange={(e) => setForm({ ...form, followsToDo: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Ban className="h-3 w-3" /> Nãos</Label>
              <Input type="number" min={0} value={form.negatives}
                onChange={(e) => setForm({ ...form, negatives: +e.target.value })} />
            </div>

          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={() => submitForm(form)} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
              Salvar e iniciar pausa
            </Button>
            <Button variant="ghost" onClick={dismissForm}>Descartar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
