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
import ColdCall from "@/modules/cold-call/pages/ColdCall";
import Oportunidades from "@/modules/pipeline/pages/Oportunidades";
import Onboarding from "@/modules/pipeline/pages/Onboarding";
import Scrum from "@/modules/metas/pages/Scrum";
import Pomodoro from "@/modules/cold-call/pages/Pomodoro";
import Dashboard from "@/modules/dashboard/pages/Dashboard";
import Metas from "@/modules/metas/pages/Metas";
import Financeiro from "@/modules/financeiro/pages/Financeiro";
import Integracoes from "@/modules/configuracoes/pages/Integracoes";
import Lembretes from "@/modules/agenda/pages/Lembretes";
import InteligenciaComercial from "@/modules/intelligence/pages/InteligenciaComercial";
import CentralDecisao from "@/modules/intelligence/pages/CentralDecisao";
import MissaoDoDia from "@/modules/intelligence/pages/MissaoDoDia";
import { IntelligenceShell } from "@/modules/intelligence/components/IntelligenceShell";
import { ManagementShell } from "@/modules/dashboard/components/ManagementShell";

import Agenda from "@/modules/agenda/pages/Agenda";
import MemoriaComercial from "@/modules/intelligence/pages/MemoriaComercial";
import { lazy, Suspense } from "react";
const Laboratorio = lazy(() => import("@/modules/laboratorio/pages/Laboratorio"));
const MetricasDiarias = lazy(() => import("@/modules/intelligence/pages/MetricasDiarias"));
const SaudeSistema = lazy(() => import("@/modules/configuracoes/pages/SaudeSistema"));
const LP01 = lazy(() => import("@/modules/public/pages/LP01"));



import Auth from "@/pages/Auth";
import OAuthConsent from "@/pages/OAuthConsent";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PomodoroProvider>
            <Routes>
              <Route path="/lp01" element={
                <Suspense fallback={<div className="min-h-screen bg-[#0b0b0d] flex items-center justify-center text-[#caa55a]">Carregando...</div>}>
                  <LP01 />
                </Suspense>
              } />
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
                        <Route path="/inteligencia/metricas" element={
                          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando Métricas…</div>}>
                            <IntelligenceShell title="Métricas" description="Fechamento diário da operação comercial">
                              <MetricasDiarias />
                            </IntelligenceShell>
                          </Suspense>
                        } />
                        <Route path="/inteligencia/central" element={<Navigate to="/inteligencia" replace />} />
                        <Route path="/inteligencia/knowledge" element={<Navigate to="/inteligencia" replace />} />
                        <Route path="/central" element={<IntelligenceShell title="Decisão" description="Comando operacional e o que fazer agora"><CentralDecisao /></IntelligenceShell>} />
                        <Route path="/missao" element={<MissaoDoDia />} />

                        <Route path="/agenda" element={<Agenda />} />
                        <Route path="/memoria" element={<IntelligenceShell title="Memória" description="Aprendizados históricos e padrões identificados"><MemoriaComercial /></IntelligenceShell>} />
                        <Route path="/saude-sistema" element={
                          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando Saúde do Sistema…</div>}>
                            <SaudeSistema />
                          </Suspense>
                        } />
                        <Route path="/laboratorio" element={
                          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando Laboratório…</div>}>
                            <IntelligenceShell title="Laboratório" description="Experimentação contínua da operação comercial">
                              <Laboratorio />
                            </IntelligenceShell>
                          </Suspense>
                        } />



                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
            </Routes>
            <PomodoroSessionFormDialog />
          </PomodoroProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
