import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PictureInPicture2 } from "lucide-react";
import { AppSidebar } from "@/shared/components/AppSidebar";
import { FloatingPomodoroWidget } from "@/modules/cold-call/components/FloatingPomodoroWidget";
import { PomodoroHeaderWidget } from "@/modules/cold-call/components/PomodoroHeaderWidget";
import { HeaderStatsWidget } from "@/shared/components/HeaderStatsWidget";
import { ForceUpdateButton } from "@/modules/configuracoes/components/ForceUpdateButton";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { useReminderNotifications } from "@/modules/agenda/hooks/useReminderNotifications";
import { PomodoroModeProvider, usePomodoroMode } from "@/contexts/PomodoroModeContext";
import { Breadcrumbs } from "@/shared/components/shell/Breadcrumbs";
import { GlobalSearch } from "@/shared/components/shell/GlobalSearch";
import { NotificationsMenu } from "@/shared/components/shell/NotificationsMenu";
import { UserMenu } from "@/shared/components/shell/UserMenu";
import { findNavItem } from "@/shared/constants/navigation";

function DockedPomodoroSlot() {
  const { mode, setMode } = usePomodoroMode();
  if (mode !== "docked") return null;
  return (
    <div className="hidden md:flex items-center gap-1">
      <PomodoroHeaderWidget />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => setMode("floating")}
        title="Soltar como janela flutuante"
      >
        <PictureInPicture2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  useReminderNotifications();
  const { pathname } = useLocation();
  const current = findNavItem(pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header global do Application Shell */}
          <header className="sticky top-0 z-sticky h-14 flex items-center gap-3 border-b border-border bg-background/85 backdrop-blur-md px-3 md:px-4 shrink-0">
            <SidebarTrigger className="shrink-0" />
            <Separator orientation="vertical" className="h-6 hidden md:block" />

            {/* Título + breadcrumb */}
            <div className="flex flex-col min-w-0 flex-1">
              <Breadcrumbs className="hidden md:flex" />
              <h1 className="text-small md:text-subtitle font-semibold text-foreground truncate leading-tight">
                {current?.title ?? "Performance21"}
              </h1>
            </div>

            {/* Busca global — só desktop/tablet */}
            <div className="hidden lg:block">
              <GlobalSearch />
            </div>

            {/* KPI compacto (meta do mês) */}
            <HeaderStatsWidget />

            {/* Pomodoro docked */}
            <DockedPomodoroSlot />

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
