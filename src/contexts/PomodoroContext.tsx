import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { addSession } from "@/lib/store";

interface TallyCounts {
  calls: number;
  messages: number;
  meetings: number;
}

interface PomodoroState {
  startedAt: number | null; // epoch ms when current focus phase started
  durationSec: number;
  breakSec: number;
  phase: "idle" | "focus" | "break" | "completed"; // completed = focus done, awaiting form
  pausedRemaining: number | null; // when paused
  niche: string;
  tally: TallyCounts;
}

const STORAGE_KEY = "p21_pomodoro_state";

const DEFAULT_TALLY: TallyCounts = { calls: 0, messages: 0, meetings: 0 };

const DEFAULT_STATE: PomodoroState = {
  startedAt: null,
  durationSec: 50 * 60,
  breakSec: 10 * 60,
  phase: "idle",
  pausedRemaining: null,
  niche: "",
  tally: { ...DEFAULT_TALLY },
};

function loadState(): PomodoroState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: PomodoroState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface PomodoroContextValue {
  state: PomodoroState;
  remaining: number;
  start: (durationSec?: number, breakSec?: number, niche?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setDuration: (focusSec: number, breakSec: number) => void;
  setNiche: (niche: string) => void;
  submitForm: (data: { calls: number; connections: number; decisionMakers: number; meetings: number; niche?: string }) => void;
  dismissForm: () => void;
  showForm: boolean;
  incrementTally: (key: keyof TallyCounts) => void;
  resetTally: () => void;
}

const Ctx = createContext<PomodoroContextValue | null>(null);

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PomodoroState>(loadState);
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const sessionStartRef = useRef<number | null>(null);

  // Persist on every change
  useEffect(() => { saveState(state); }, [state]);

  // Init: if loaded state has phase completed, show form again
  useEffect(() => {
    if (state.phase === "completed") setShowForm(true);
    if (state.phase === "focus" && state.startedAt) {
      sessionStartRef.current = state.startedAt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute remaining (works even if tab was inactive)
  const computeRemaining = useCallback((s: PomodoroState): number => {
    if (s.phase === "idle" || s.phase === "completed") return s.durationSec;
    if (s.pausedRemaining != null) return s.pausedRemaining;
    if (!s.startedAt) return s.phase === "break" ? s.breakSec : s.durationSec;
    const total = s.phase === "break" ? s.breakSec : s.durationSec;
    const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
    return Math.max(0, total - elapsed);
  }, []);

  // Tick every second to update UI; also detect phase completion
  useEffect(() => {
    if (state.phase !== "focus" && state.phase !== "break") {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      setTick((t) => t + 1);
      const r = computeRemaining(state);
      if (r <= 0) {
        if (state.phase === "focus") {
          setState((prev) => ({ ...prev, phase: "completed", pausedRemaining: null, startedAt: null }));
          setShowForm(true);
        } else if (state.phase === "break") {
          setState((prev) => ({ ...prev, phase: "idle", pausedRemaining: null, startedAt: null }));
        }
      }
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state, computeRemaining]);

  const start = (durationSec?: number, breakSec?: number, niche?: string) => {
    const focus = durationSec ?? state.durationSec;
    const brk = breakSec ?? state.breakSec;
    sessionStartRef.current = Date.now();
    setState({
      startedAt: Date.now(),
      durationSec: focus,
      breakSec: brk,
      phase: "focus",
      pausedRemaining: null,
      niche: niche ?? state.niche,
      tally: { ...DEFAULT_TALLY },
    });
  };

  const incrementTally = (key: keyof TallyCounts) => {
    setState((prev) => ({ ...prev, tally: { ...prev.tally, [key]: prev.tally[key] + 1 } }));
  };

  const resetTally = () => {
    setState((prev) => ({ ...prev, tally: { ...DEFAULT_TALLY } }));
  };

  const pause = () => {
    if (state.phase !== "focus" && state.phase !== "break") return;
    const r = computeRemaining(state);
    setState({ ...state, pausedRemaining: r, startedAt: null });
  };

  const resume = () => {
    if (state.pausedRemaining == null) return;
    const total = state.phase === "break" ? state.breakSec : state.durationSec;
    const offset = total - state.pausedRemaining;
    setState({ ...state, startedAt: Date.now() - offset * 1000, pausedRemaining: null });
  };

  const stop = () => {
    if (state.phase === "focus") {
      setState({ ...state, phase: "completed", startedAt: null, pausedRemaining: null });
      setShowForm(true);
    } else {
      setState({ ...state, phase: "idle", startedAt: null, pausedRemaining: null });
      sessionStartRef.current = null;
    }
  };

  const setDuration = (focusSec: number, breakSec: number) => {
    if (state.phase !== "idle") return;
    setState({ ...state, durationSec: focusSec, breakSec });
  };

  const setNiche = (niche: string) => setState({ ...state, niche });

  const submitForm = (data: { calls: number; connections: number; decisionMakers: number; meetings: number; niche?: string }) => {
    const start = sessionStartRef.current ?? Date.now() - state.durationSec * 1000;
    const end = Date.now();
    addSession({
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      durationMinutes: Math.round(state.durationSec / 60),
      calls: data.calls,
      connections: data.connections,
      decisionMakers: data.decisionMakers,
      meetings: data.meetings,
      niche: data.niche || state.niche || undefined,
    });
    sessionStartRef.current = null;
    setShowForm(false);
    // Start break automatically
    setState((prev) => ({
      ...prev,
      phase: "break",
      startedAt: Date.now(),
      pausedRemaining: null,
    }));
  };

  const dismissForm = () => {
    setShowForm(false);
    setState((prev) => ({ ...prev, phase: "idle", startedAt: null, pausedRemaining: null }));
    sessionStartRef.current = null;
  };

  const remaining = computeRemaining(state);

  return (
    <Ctx.Provider
      value={{
        state, remaining, start, pause, resume, stop,
        setDuration, setNiche, submitForm, dismissForm, showForm,
        incrementTally, resetTally,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePomodoro() {
  const v = useContext(Ctx);
  if (!v) {
    // Defensive fallback (e.g. during HMR): return no-op stub instead of crashing the tree.
    console.warn("usePomodoro called outside PomodoroProvider — using fallback");
    return {
      state: { ...DEFAULT_STATE },
      remaining: DEFAULT_STATE.durationSec,
      start: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
      setDuration: () => {},
      setNiche: () => {},
      submitForm: () => {},
      dismissForm: () => {},
      showForm: false,
      incrementTally: () => {},
      resetTally: () => {},
    } as PomodoroContextValue;
  }
  return v;
}
