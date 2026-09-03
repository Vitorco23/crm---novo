import { createContext, useContext } from "react";

// React context follows portals; CSS inheritance alone cannot reach them.
const MissionThemeContext = createContext(false);

export const MissionThemeProvider = MissionThemeContext.Provider;

export function useMissionThemeClass() {
  return useContext(MissionThemeContext) ? "mission-theme" : undefined;
}
