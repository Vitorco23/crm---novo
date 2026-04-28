import { usePomodoro } from "@/contexts/PomodoroContext";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Timer } from "lucide-react";
import { Link } from "react-router-dom";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroHeaderWidget() {
  const { state, remaining, start, pause, resume, stop } = usePomodoro();

  const phaseLabel =
    state.phase === "focus" ? "Foco" :
    state.phase === "break" ? "Pausa" :
    state.phase === "completed" ? "Registrar" : "Pomodoro";

  const isRunning = state.startedAt != null && (state.phase === "focus" || state.phase === "break");
  const isPaused = state.pausedRemaining != null;

  return (
    <div className="flex items-center gap-2">
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
    </div>
  );
}
