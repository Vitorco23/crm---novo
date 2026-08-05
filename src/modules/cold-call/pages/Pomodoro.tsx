import { useState } from "react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { getSessions, updateSession, deleteSession, addSession, type PomodoroSession } from "@/shared/services/store";
import { getScripts } from "@/modules/knowledge/services/scripts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Square, Clock, Phone, Users, UserCheck, CalendarCheck, Tag, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Pomodoro() {
  const { state, remaining, start, pause, resume, stop, setDuration, setNiche } = usePomodoro();
  const [focusMin, setFocusMin] = useState(Math.round(state.durationSec / 60));
  const [breakMin, setBreakMin] = useState(Math.round(state.breakSec / 60));
  const [sessions, setSessions] = useState<PomodoroSession[]>(getSessions);
  const [editing, setEditing] = useState<PomodoroSession | null>(null);

  const refresh = () => setSessions(getSessions());

  const isRunning = state.startedAt != null && (state.phase === "focus" || state.phase === "break");
  const isPaused = state.pausedRemaining != null;

  const totalForPhase = state.phase === "break" ? state.breakSec : state.durationSec;
  const progress = ((totalForPhase - remaining) / totalForPhase) * 100;

  const phaseLabel =
    state.phase === "focus" ? "Focado" :
    state.phase === "break" ? "Pausa" :
    state.phase === "completed" ? "Registre a sessão" : "Pronto";

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-foreground">Pomodoro de Outreach</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timer */}
        <Card>
          <CardContent className="pt-6 flex flex-col items-center">
            <div className="relative w-48 h-48 mb-6">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" strokeWidth="4" className="stroke-muted" />
                <circle
                  cx="50" cy="50" r="45" fill="none" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className={state.phase === "break" ? "stroke-warning transition-all duration-1000" : "stroke-accent transition-all duration-1000"}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-foreground tabular-nums">{fmt(remaining)}</span>
                <span className="text-xs text-muted-foreground mt-1">{phaseLabel}</span>
              </div>
            </div>

            <div className="w-full mb-4">
              <Label className="text-xs flex items-center gap-1 mb-1"><Tag className="h-3 w-3" /> Nicho atual</Label>
              <Input
                placeholder="Ex: Odontologia, Advocacia..."
                value={state.niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={state.phase === "focus" || state.phase === "break"}
              />
            </div>

            <div className="flex gap-2 mb-4">
              {state.phase === "idle" || state.phase === "completed" ? (
                <Button onClick={() => start(focusMin * 60, breakMin * 60)} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Play className="h-4 w-4 mr-1" /> Iniciar
                </Button>
              ) : isPaused ? (
                <Button onClick={resume} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Play className="h-4 w-4 mr-1" /> Retomar
                </Button>
              ) : isRunning ? (
                <Button onClick={pause} size="sm" variant="secondary">
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </Button>
              ) : null}
              {(isRunning || isPaused) && (
                <Button onClick={stop} size="sm" variant="outline">
                  <Square className="h-4 w-4 mr-1" /> Parar
                </Button>
              )}
            </div>

            <div className="flex gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Foco (min)</Label>
                <Input
                  type="number" className="w-20 text-center" value={focusMin} min={1}
                  disabled={state.phase !== "idle"}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setFocusMin(v);
                    setDuration(v * 60, breakMin * 60);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pausa (min)</Label>
                <Input
                  type="number" className="w-20 text-center" value={breakMin} min={1}
                  disabled={state.phase !== "idle"}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setBreakMin(v);
                    setDuration(focusMin * 60, v * 60);
                  }}
                />
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/70 mt-4 text-center max-w-xs">
              O timer continua rodando mesmo se você trocar de aba ou fechar o navegador.
            </p>
          </CardContent>
        </Card>

        {/* Session Log */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Log de Sessões
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                onClick={() => setEditing({
                  id: "new",
                  startTime: new Date().toISOString(),
                  endTime: new Date().toISOString(),
                  durationMinutes: 50,
                  calls: 0,
                  connections: 0,
                  decisionMakers: 0,
                  meetings: 0
                } as any)}
              >
                + Adicionar Log
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={refresh}>Atualizar</Button>
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
                {[...sessions].reverse().map((s) => (
                  <div key={s.id} className="rounded-md border p-2.5 text-sm animate-slide-in group">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {format(new Date(s.startTime), "dd/MM HH:mm", { locale: ptBR })} → {format(new Date(s.endTime), "HH:mm", { locale: ptBR })}
                        {s.niche && <span className="ml-2 text-accent">· {s.niche}</span>}
                        {s.scriptUsed && <span className="ml-2 text-muted-foreground">· {s.scriptUsed}</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{s.durationMinutes}min</span>
                        <button
                          className="opacity-60 hover:opacity-100 hover:text-accent transition"
                          onClick={() => setEditing(s)}
                          title="Editar sessão"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          className="opacity-60 hover:opacity-100 hover:text-destructive transition"
                          onClick={() => {
                            if (confirm("Excluir esta sessão? As métricas serão atualizadas em todo o sistema.")) {
                              deleteSession(s.id);
                              refresh();
                              toast({ title: "Sessão excluída" });
                            }
                          }}
                          title="Excluir sessão"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-accent" />{s.calls}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3 text-accent" />{s.connections || 0}</span>
                      <span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-accent" />{s.decisionMakers || 0}</span>
                      <span className="flex items-center gap-1"><CalendarCheck className="h-3 w-3 text-accent" />{s.meetings}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EditSessionDialog
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    </div>
  );
}

function EditSessionDialog({
  session,
  onClose,
  onSaved,
}: {
  session: PomodoroSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PomodoroSession | null>(session);
  const scripts = getScripts();

  // Sync when session changes
  if (session && (!form || form.id !== session.id)) {
    setForm(session);
  }
  if (!session || !form) return null;

  const save = () => {
    const data = {
      calls: Math.max(0, form.calls || 0),
      connections: Math.max(0, form.connections || 0),
      decisionMakers: Math.max(0, form.decisionMakers || 0),
      meetings: Math.max(0, form.meetings || 0),
      durationMinutes: Math.max(1, form.durationMinutes || 1),
      niche: form.niche?.trim() || undefined,
      scriptUsed: form.scriptUsed || undefined,
    };

    if (session.id === "new") {
      addSession({
        ...data,
        startTime: form.startTime || new Date().toISOString(),
        endTime: form.endTime || new Date().toISOString(),
      });
      toast({ title: "Sessão registrada", description: "O log manual foi adicionado com sucesso." });
    } else {
      updateSession(session.id, data);
      toast({ title: "Sessão atualizada", description: "As métricas foram recalculadas em todo o sistema." });
    }
    onSaved();
  };

  return (
    <Dialog open={!!session} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session.id === "new" ? "Adicionar Log de Pomodoro" : "Editar Sessão de Pomodoro"}</DialogTitle>
          <DialogDescription className="text-xs">
            {session.id === "new" 
              ? "Registre manualmente uma sessão realizada anteriormente."
              : `${format(new Date(session.startTime), "dd/MM/yyyy HH:mm", { locale: ptBR })} · alterações refletem em Metas, Dashboard, Cold Call e IA.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nicho</Label>
            <Input value={form.niche || ""} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
          </div>

          <div>
            <Label className="text-xs">Script utilizado</Label>
            <Select value={form.scriptUsed || ""} onValueChange={(v) => setForm({ ...form, scriptUsed: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
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
            <div className="col-span-2">
              <Label className="text-xs">Duração (min)</Label>
              <Input type="number" min={1} value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} className="bg-accent text-accent-foreground hover:bg-accent/90">Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
