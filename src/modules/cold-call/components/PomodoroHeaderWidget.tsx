import { useEffect, useState } from "react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Timer, Phone, Users, UserCheck, MessageSquare, CalendarCheck, FileText, ListTodo, Ban } from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getScripts, getSelectedScript, setSelectedScript, logCall, type ScriptOption } from "@/modules/knowledge/services/scripts";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroHeaderWidget() {
  const { state, remaining, start, pause, resume, stop, incrementTally } = usePomodoro();
  const [scripts, setScripts] = useState<string[]>(() => getScripts());
  const [script, setScript] = useState<ScriptOption>(() => getSelectedScript());

  useEffect(() => {
    const refresh = () => {
      const list = getScripts();
      setScripts(list);
      setScript((prev) => (list.includes(prev) ? prev : list[0]));
    };
    refresh();
    window.addEventListener("p21:scripts-changed", refresh);
    return () => window.removeEventListener("p21:scripts-changed", refresh);
  }, []);

  const handleScriptChange = (v: string) => {
    const s = v as ScriptOption;
    setScript(s);
    setSelectedScript(s);
  };

  const registerCall = () => {
    incrementTally("calls");
    logCall({ scriptUsed: script, source: "pomodoro_header" });
  };

  const phaseLabel =
    state.phase === "focus" ? "Foco" :
    state.phase === "break" ? "Pausa" :
    state.phase === "completed" ? "Registrar" : "Pomodoro";

  const isRunning = state.startedAt != null && (state.phase === "focus" || state.phase === "break");
  const isPaused = state.pausedRemaining != null;
  const tally = state.tally ?? { calls: 0, connections: 0, decisionMakers: 0, messages: 0, meetings: 0, r1: 0, followsToDo: 0, negatives: 0 };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/pomodoro"
        className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
      >
        <Timer className={`h-3.5 w-3.5 ${state.phase === "focus" ? "text-accent" : state.phase === "break" ? "text-warning" : "text-muted-foreground"}`} />
        <span className="text-xs font-medium text-muted-foreground">{phaseLabel}</span>
        <span className="text-sm font-bold tabular-nums text-foreground">{fmt(remaining)}</span>
      </Link>
      <div className="flex gap-1">
        {state.phase === "idle" || state.phase === "completed" ? (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => start()} title="Iniciar">
            <Play className="h-3.5 w-3.5" />
          </Button>
        ) : isPaused ? (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={resume} title="Retomar">
            <Play className="h-3.5 w-3.5" />
          </Button>
        ) : isRunning ? (
          <>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={pause} title="Pausar">
              <Pause className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={stop} title="Parar">
              <Square className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1 pl-2 border-l border-border">
        <Select value={script} onValueChange={handleScriptChange}>
          <SelectTrigger
            className="h-7 w-[110px] text-xs gap-1 px-2"
            title="Script utilizado nas ligações"
          >
            <FileText className="h-3 w-3 text-accent shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scripts.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={registerCall}
          title={`Registrar ligação (${script})`}
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <Phone className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.calls}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("connections")}
          title="Registrar conexão (atenderam)"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <Users className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.connections}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("decisionMakers")}
          title="Registrar decisor (falei com o responsável)"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <UserCheck className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.decisionMakers}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("messages")}
          title="Registrar mensagem"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.messages}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("meetings")}
          title="Registrar reunião marcada"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <CalendarCheck className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.meetings}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("r1")}
          title="Registrar R1"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <Zap className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.r1}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("followsToDo")}
          title="Registrar Follows a fazer"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <ListTodo className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.followsToDo}</span>
        </button>
        <button
          type="button"
          onClick={() => incrementTally("negatives")}
          title="Registrar Nãos (Negativas)"
          className="flex items-center gap-1 px-2 h-7 rounded-md border border-border bg-card hover:bg-accent/10 transition-colors"
        >
          <Ban className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-bold tabular-nums text-foreground">{tally.negatives}</span>
        </button>

      </div>
    </div>
  );
}
