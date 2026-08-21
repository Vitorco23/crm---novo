import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/shared/components/AppLayout";
import { PomodoroProvider } from "@/contexts/PomodoroContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { PomodoroSessionFormDialog } from "@/modules/cold-call/components/PomodoroSessionFormDialog";
import { IntelligenceShell } from "@/modules/intelligence/components/IntelligenceShell";
import { ManagementShell } from "@/modules/dashboard/components/ManagementShell";
import { ConnectivityNotifier } from "@/shared/components/ConnectivityNotifier";

const ColdCall = lazy(() => import("@/modules/cold-call/pages/ColdCall"));
const Oportunidades = lazy(() => import("@/modules/pipeline/pages/Oportunidades"));
const Onboarding = lazy(() => import("@/modules/pipeline/pages/Onboarding"));
const Scrum = lazy(() => import("@/modules/metas/pages/Scrum"));
const Pomodoro = lazy(() => import("@/modules/cold-call/pages/Pomodoro"));
const Dashboard = lazy(() => import("@/modules/dashboard/pages/Dashboard"));
const Metas = lazy(() => import("@/modules/metas/pages/Metas"));
const Financeiro = lazy(() => import("@/modules/financeiro/pages/Financeiro"));
const Integracoes = lazy(() => import("@/modules/configuracoes/pages/Integracoes"));
const Lembretes = lazy(() => import("@/modules/agenda/pages/Lembretes"));
const InteligenciaComercial = lazy(() => import("@/modules/intelligence/pages/InteligenciaComercial"));
const CentralDecisao = lazy(() => import("@/modules/intelligence/pages/CentralDecisao"));
const MissaoDoDia = lazy(() => import("@/modules/intelligence/pages/MissaoDoDia"));
const Agenda = lazy(() => import("@/modules/agenda/pages/Agenda"));
const MemoriaComercial = lazy(() => import("@/modules/intelligence/pages/MemoriaComercial"));
const WhatsAppPage = lazy(() => import("@/modules/whatsapp/pages/WhatsAppPage"));
const Laboratorio = lazy(() => import("@/modules/laboratorio/pages/Laboratorio"));
const MetricasDiarias = lazy(() => import("@/modules/intelligence/pages/MetricasDiarias"));
const SaudeSistema = lazy(() => import("@/modules/configuracoes/pages/SaudeSistema"));
const Auth = lazy(() => import("@/pages/Auth"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
      Carregando…
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ConnectivityNotifier />
            <PomodoroProvider>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Routes>
                            <Route path="/" element={<ColdCall />} />
                            <Route path="/oportunidades" element={<Oportunidades />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/scrum" element={<ManagementShell title="Plano de Ação" description="Gestão de tarefas e sprints"><Scrum /></ManagementShell>} />
                            <Route path="/pomodoro" element={<ManagementShell title="Performance" description="Desempenho operacional e produtividade"><Pomodoro /></ManagementShell>} />
                            <Route path="/dashboard" element={<ManagementShell title="Visão Executiva" description="Visão consolidada da gestão comercial"><Dashboard /></ManagementShell>} />
                            <Route path="/metas" element={<ManagementShell title="Metas" description="Acompanhamento de objetivos e conversão"><Metas /></ManagementShell>} />
                            <Route path="/financeiro" element={<ManagementShell title="Financeiro" description="Saúde financeira e receitas"><Financeiro /></ManagementShell>} />
                            <Route path="/integracoes" element={<Integracoes />} />
                            <Route path="/lembretes" element={<Lembretes />} />
                            <Route path="/inteligencia" element={<IntelligenceShell title="Visão Geral" description="Consolidação da inteligência comercial"><InteligenciaComercial /></IntelligenceShell>} />
                            <Route path="/inteligencia/metricas" element={<IntelligenceShell title="Métricas" description="Fechamento diário da operação comercial"><MetricasDiarias /></IntelligenceShell>} />
                            <Route path="/inteligencia/central" element={<Navigate to="/inteligencia" replace />} />
                            <Route path="/inteligencia/knowledge" element={<Navigate to="/inteligencia" replace />} />
                            <Route path="/central" element={<IntelligenceShell title="Decisão" description="Comando operacional e o que fazer agora"><CentralDecisao /></IntelligenceShell>} />
                            <Route path="/missao" element={<MissaoDoDia />} />
                            <Route path="/whatsapp" element={<WhatsAppPage />} />
                            <Route path="/agenda" element={<Agenda />} />
                            <Route path="/memoria" element={<IntelligenceShell title="Memória" description="Aprendizados históricos e padrões identificados"><MemoriaComercial /></IntelligenceShell>} />
                            <Route path="/saude-sistema" element={<SaudeSistema />} />
                            <Route path="/laboratorio" element={<IntelligenceShell title="Laboratório" description="Experimentação contínua da operação comercial"><Laboratorio /></IntelligenceShell>} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </Suspense>
              <PomodoroSessionFormDialog />
            </PomodoroProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
