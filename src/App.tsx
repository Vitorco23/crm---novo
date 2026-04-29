import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PomodoroProvider } from "@/contexts/PomodoroContext";
import { PomodoroSessionFormDialog } from "@/components/PomodoroSessionFormDialog";
import ColdCall from "./pages/ColdCall";
import Oportunidades from "./pages/Oportunidades";
import Onboarding from "./pages/Onboarding";
import Scrum from "./pages/Scrum";
import Pomodoro from "./pages/Pomodoro";
import Dashboard from "./pages/Dashboard";
import Metas from "./pages/Metas";
import Integracoes from "./pages/Integracoes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PomodoroProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<ColdCall />} />
              <Route path="/oportunidades" element={<Oportunidades />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/scrum" element={<Scrum />} />
              <Route path="/pomodoro" element={<Pomodoro />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/metas" element={<Metas />} />
              <Route path="/integracoes" element={<Integracoes />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
          <PomodoroSessionFormDialog />
        </BrowserRouter>
      </PomodoroProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
