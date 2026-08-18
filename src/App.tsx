import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { PublicRouteWrapper } from "./modules/public/components/PublicRouteWrapper";
import { PrivateRouteWrapper } from "./modules/public/components/PrivateRouteWrapper";

// Lazy-loaded Private Components
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

// Shell components (can stay static if light, but IntelligenceShell/ManagementShell are used in private routes)
const IntelligenceShell = lazy(() => import("@/modules/intelligence/components/IntelligenceShell").then(m => ({ default: m.IntelligenceShell })));
const ManagementShell = lazy(() => import("@/modules/dashboard/components/ManagementShell").then(m => ({ default: m.ManagementShell })));

const Laboratorio = lazy(() => import("@/modules/laboratorio/pages/Laboratorio"));
const MetricasDiarias = lazy(() => import("@/modules/intelligence/pages/MetricasDiarias"));
const SaudeSistema = lazy(() => import("@/modules/configuracoes/pages/SaudeSistema"));
const LP01 = lazy(() => import("@/modules/public/pages/LP01"));

const Auth = lazy(() => import("@/pages/Auth"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));


const App = () => (
  <BrowserRouter>
    <Routes>
      {/* Rota Pública LP01 - Isolada */}
      <Route
        path="/lp01"
        element={
          <PublicRouteWrapper>
            <Suspense fallback={<div className="min-h-screen bg-[#0b0b0d] flex items-center justify-center text-[#caa55a]">Carregando...</div>}>
              <LP01 />
            </Suspense>
          </PublicRouteWrapper>
        }
      />

      {/* Outras rotas públicas/base */}
      <Route path="/auth" element={<PublicRouteWrapper><Suspense fallback={null}><Auth /></Suspense></PublicRouteWrapper>} />
      <Route path="/reset-password" element={<PublicRouteWrapper><Suspense fallback={null}><ResetPassword /></Suspense></PublicRouteWrapper>} />
      <Route path="/.lovable/oauth/consent" element={<PublicRouteWrapper><Suspense fallback={null}><OAuthConsent /></Suspense></PublicRouteWrapper>} />

      {/* Rotas Privadas - Com Auth e Pomodoro Providers */}
      <Route
        path="/*"
        element={
          <PublicRouteWrapper>
            <PrivateRouteWrapper>
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
            </PrivateRouteWrapper>
          </PublicRouteWrapper>
        }
      />
    </Routes>
  </BrowserRouter>
);

export default App;
