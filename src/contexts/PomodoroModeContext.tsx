import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Mode = "floating" | "docked";
const KEY = "p21:pomodoro-mode";

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "docked",
  setMode: () => {},
});

export function PomodoroModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    return v === "floating" ? "floating" : "docked";
  });
  useEffect(() => {
    localStorage.setItem(KEY, mode);
  }, [mode]);
  return <Ctx.Provider value={{ mode, setMode: setModeState }}>{children}</Ctx.Provider>;
}

export const usePomodoroMode = () => useContext(Ctx);
