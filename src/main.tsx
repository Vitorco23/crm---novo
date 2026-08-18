import { createRoot } from "react-dom/client";
import App from "@/App.tsx";
import "@/index.css";
import { registerPWA } from "@/pwa/registerSW";
import { applyStandaloneClass } from "@/pwa/pwa";
import { installEventWiring } from "@/shared/services/eventWiring";

// Optimized bootstrap for LP01
const isLPRoute = window.location.pathname === "/lp01";

if (!isLPRoute) {
  applyStandaloneClass();
  installEventWiring();
  registerPWA();
}

createRoot(document.getElementById("root")!).render(<App />);
