import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingPomodoroWidget } from "@/components/FloatingPomodoroWidget";
import { PomodoroHeaderWidget } from "@/components/PomodoroHeaderWidget";
import { HeaderStatsWidget } from "@/components/HeaderStatsWidget";
import { ForceUpdateButton } from "@/components/ForceUpdateButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, PictureInPicture2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import { PomodoroModeProvider, usePomodoroMode } from "@/contexts/PomodoroModeContext";

function DockedPomodoroSlot() {
  const { mode, setMode } = usePomodoroMode();
  if (mode !== "docked") return null;
  return (
    <div className="flex items-center gap-1">
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
  const { user, isAdmin, signOut } = useAuth();
  useReminderNotifications();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b px-2 shrink-0 gap-2">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <DockedPomodoroSlot />
              <HeaderStatsWidget />
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                  {isAdmin && <Shield className="h-3 w-3 text-primary" />}
                  {user?.email}
                </span>
                <ForceUpdateButton />
                <ThemeToggle className="h-8 w-8" />
                <Button size="icon" variant="ghost" onClick={signOut} title="Sair">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
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
