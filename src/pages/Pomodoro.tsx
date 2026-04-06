import { useState, useEffect, useRef, useCallback } from "react";
import { addSession, getSessions, type PomodoroSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, Square, Clock, Phone, MessageSquare, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Pomodoro() {
  const [duration, setDuration] = useState(50);
  const [breakTime, setBreakTime] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(duration * 60);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ calls: 0, messages: 0, meetings: 0 });
  const [sessions, setSessions] = useState<PomodoroSession[]>(getSessions);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => setSessions(getSessions()), []);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          if (!onBreak) {
            setShowForm(true);
          } else {
            setOnBreak(false);
            setSecondsLeft(duration * 60);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [running, onBreak, duration]);

  const start = () => {
    if (!running && !showForm) {
      if (!startTime) setStartTime(new Date());
      setRunning(true);
    }
  };

  const pause = () => {
    setRunning(false);
  };

  const stop = () => {
    setRunning(false);
    if (startTime) setShowForm(true);
    else {
      setSecondsLeft(duration * 60);
    }
  };

  const submitSession = () => {
    const end = new Date();
    addSession({
      startTime: startTime!.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: duration,
      calls: form.calls,
      messages: form.messages,
      meetings: form.meetings,
    });
    setForm({ calls: 0, messages: 0, meetings: 0 });
    setShowForm(false);
    setStartTime(null);
    setOnBreak(true);
    setSecondsLeft(breakTime * 60);
    refresh();
  };

  const resetTimer = () => {
    setRunning(false);
    setShowForm(false);
    setStartTime(null);
    setOnBreak(false);
    setSecondsLeft(duration * 60);
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = onBreak
    ? ((breakTime * 60 - secondsLeft) / (breakTime * 60)) * 100
    : ((duration * 60 - secondsLeft) / (duration * 60)) * 100;

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
                  className={onBreak ? "stroke-warning transition-all duration-1000" : "stroke-accent transition-all duration-1000"}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-foreground tabular-nums">
                  {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {onBreak ? "Pausa" : running ? "Focado" : "Pronto"}
                </span>
              </div>
            </div>

            {showForm ? (
              <div className="w-full space-y-3 animate-slide-in">
                <p className="text-sm font-medium text-foreground text-center">Registre a sessão</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <Label className="text-xs flex items-center justify-center gap-1 mb-1">
                      <Phone className="h-3 w-3" /> Ligações
                    </Label>
                    <Input type="number" min={0} value={form.calls}
                      onChange={(e) => setForm({ ...form, calls: +e.target.value })} className="text-center" />
                  </div>
                  <div className="text-center">
                    <Label className="text-xs flex items-center justify-center gap-1 mb-1">
                      <MessageSquare className="h-3 w-3" /> Msgs
                    </Label>
                    <Input type="number" min={0} value={form.messages}
                      onChange={(e) => setForm({ ...form, messages: +e.target.value })} className="text-center" />
                  </div>
                  <div className="text-center">
                    <Label className="text-xs flex items-center justify-center gap-1 mb-1">
                      <CalendarCheck className="h-3 w-3" /> Reuniões
                    </Label>
                    <Input type="number" min={0} value={form.meetings}
                      onChange={(e) => setForm({ ...form, meetings: +e.target.value })} className="text-center" />
                  </div>
                </div>
                <Button onClick={submitSession} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  Salvar Sessão
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  {!running ? (
                    <Button onClick={start} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                      <Play className="h-4 w-4 mr-1" /> Iniciar
                    </Button>
                  ) : (
                    <Button onClick={pause} size="sm" variant="secondary">
                      <Pause className="h-4 w-4 mr-1" /> Pausar
                    </Button>
                  )}
                  <Button onClick={stop} size="sm" variant="outline">
                    <Square className="h-4 w-4 mr-1" /> Parar
                  </Button>
                  <Button onClick={resetTimer} size="sm" variant="ghost">Reset</Button>
                </div>

                <div className="flex gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Foco (min)</Label>
                    <Input type="number" className="w-20 text-center" value={duration} min={1}
                      onChange={(e) => { setDuration(+e.target.value); if (!running && !startTime) setSecondsLeft(+e.target.value * 60); }} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Pausa (min)</Label>
                    <Input type="number" className="w-20 text-center" value={breakTime} min={1}
                      onChange={(e) => setBreakTime(+e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Session Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Log de Sessões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                {[...sessions].reverse().map((s) => (
                  <div key={s.id} className="rounded-md border p-2.5 text-sm animate-slide-in">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{format(new Date(s.startTime), "dd/MM HH:mm", { locale: ptBR })} → {format(new Date(s.endTime), "HH:mm", { locale: ptBR })}</span>
                      <span>{s.durationMinutes}min</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-accent" />{s.calls}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3 text-accent" />{s.messages}</span>
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
