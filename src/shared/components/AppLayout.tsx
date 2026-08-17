import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/shared/components/AppSidebar";
import { FloatingPomodoroWidget } from "@/modules/cold-call/components/FloatingPomodoroWidget";
import { HeaderStatsWidget } from "@/shared/components/HeaderStatsWidget";
import { ForceUpdateButton } from "@/modules/configuracoes/components/ForceUpdateButton";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { useReminderNotifications } from "@/modules/agenda/hooks/useReminderNotifications";
import { PomodoroModeProvider } from "@/contexts/PomodoroModeContext";
import { Breadcrumbs } from "@/shared/components/shell/Breadcrumbs";
import { GlobalSearch } from "@/shared/components/shell/GlobalSearch";
import { NotificationsMenu } from "@/shared/components/shell/NotificationsMenu";
import { UserMenu } from "@/shared/components/shell/UserMenu";
import { findNavItem } from "@/shared/constants/navigation";
import { useInboundLeadRealtime } from "@/shared/hooks/useInboundLeadRealtime";



function LayoutInner({ children }: { children: React.ReactNode }) {
  useReminderNotifications();
  useInboundLeadRealtime();

  const { pathname } = useLocation();
  const current = findNavItem(pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header global do Application Shell */}
          <header className="sticky top-0 z-sticky h-14 flex items-center gap-4 border-b border-border/60 bg-background/60 backdrop-blur-xl px-4 shrink-0 transition-all duration-300">
            <SidebarTrigger className="shrink-0 hover:bg-muted" />
            <Separator orientation="vertical" className="h-6 hidden md:block opacity-40" />

            {/* Título + breadcrumb */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <h1 className="text-small md:text-subtitle font-bold text-foreground truncate tracking-tight">
                {current?.title ?? "Performance21"}
              </h1>
              <Breadcrumbs className="hidden md:flex opacity-60" />
            </div>

            {/* Busca global — só desktop/tablet */}
            <div className="hidden lg:block">
              <GlobalSearch />
            </div>

            {/* KPI compacto (meta do mês) */}
            <HeaderStatsWidget />




            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            {/* Ações do usuário */}
            <div className="flex items-center gap-1">
              <NotificationsMenu />
              <ForceUpdateButton />
              <ThemeToggle className="h-8 w-8" />
              <UserMenu />
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <FloatingPomodoroWidget />
      </div>
    </SidebarProvider>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PomodoroModeProvider>
      <LayoutInner>{children}</LayoutInner>
    </PomodoroModeProvider>
  );
}
