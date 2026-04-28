import { useState } from "react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { getSessions, type PomodoroSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, Square, Clock, Phone, Users, UserCheck, CalendarCheck, Tag } from "lucide-react";
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
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={refresh}>Atualizar</Button>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
                {[...sessions].reverse().map((s) => (
                  <div key={s.id} className="rounded-md border p-2.5 text-sm animate-slide-in">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {format(new Date(s.startTime), "dd/MM HH:mm", { locale: ptBR })} → {format(new Date(s.endTime), "HH:mm", { locale: ptBR })}
                        {s.niche && <span className="ml-2 text-accent">· {s.niche}</span>}
                      </span>
                      <span>{s.durationMinutes}min</span>
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
    </div>
  );
}
