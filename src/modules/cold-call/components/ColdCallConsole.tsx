import { PictureInPicture2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PomodoroHeaderWidget } from "@/modules/cold-call/components/PomodoroHeaderWidget";
import { usePomodoroMode } from "@/contexts/PomodoroModeContext";

/**
 * Console Operacional da Cold Call.
 * Reaproveita integralmente o widget existente — apenas muda o contexto de renderização.
 * Quando o modo é "floating", o console vive no FloatingPomodoroWidget.
 */
export function ColdCallConsole() {
  const { mode, setMode } = usePomodoroMode();

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Console Operacional
        </span>
        {mode === "docked" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => setMode("floating")}
            title="Soltar como janela flutuante"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {mode === "docked" ? (
        /* Área do console — preparada para novos blocos futuros (sessão, fechamento do dia, disparos) */
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PomodoroHeaderWidget />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Console em modo flutuante — arraste a janela para onde preferir.</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setMode("docked")}>
            Fixar na página
          </Button>
        </div>
      )}
    </section>
  );
}
