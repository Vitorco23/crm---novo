import { createRoot } from "react-dom/client";
import App from "@/App.tsx";
import "@/index.css";
import { registerPWA } from "@/pwa/registerSW";
import { applyStandaloneClass } from "@/pwa/pwa";
import { installEventWiring } from "@/shared/services/eventWiring";

applyStandaloneClass();
installEventWiring();

createRoot(document.getElementById("root")!).render(<App />);

registerPWA();
