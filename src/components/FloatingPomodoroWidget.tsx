import { useEffect, useRef, useState } from "react";
import { PomodoroHeaderWidget } from "@/components/PomodoroHeaderWidget";
import { GripVertical, Minus, Plus, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePomodoroMode } from "@/contexts/PomodoroModeContext";

const STORAGE_KEY = "p21:floating-pomodoro-pos";
const COLLAPSED_KEY = "p21:floating-pomodoro-collapsed";

type Pos = { x: number; y: number };

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // default: top-right-ish, below header
  return { x: Math.max(16, window.innerWidth - 900), y: 64 };
}

export function FloatingPomodoroWidget() {
  const { mode, setMode } = usePomodoroMode();
  const [pos, setPos] = useState<Pos>(() => loadPos());
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const w = elRef.current?.offsetWidth ?? 400;
      const h = elRef.current?.offsetHeight ?? 50;
      const nx = Math.min(window.innerWidth - w - 4, Math.max(4, e.clientX - dragRef.current.dx));
      const ny = Math.min(window.innerHeight - h - 4, Math.max(4, e.clientY - dragRef.current.dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = elRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };

  if (mode === "docked") return null;

  return (
    <div
      ref={elRef}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 flex items-center gap-1 bg-card border border-border rounded-lg shadow-lg px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/90"
    >
      <div
        onMouseDown={onMouseDown}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        title="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {!collapsed && <PomodoroHeaderWidget />}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expandir" : "Recolher"}
      >
        {collapsed ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={() => setMode("docked")}
        title="Fixar no cabeçalho"
      >
        <PinOff className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
