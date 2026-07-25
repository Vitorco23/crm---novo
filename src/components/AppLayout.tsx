import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PomodoroHeaderWidget } from "@/components/PomodoroHeaderWidget";
import { HeaderStatsWidget } from "@/components/HeaderStatsWidget";
import { ForceUpdateButton } from "@/components/ForceUpdateButton";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";

export function AppLayout({ children }: { children: React.ReactNode }) {
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
              <PomodoroHeaderWidget />
              <HeaderStatsWidget />
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                  {isAdmin && <Shield className="h-3 w-3 text-primary" />}
                  {user?.email}
                </span>
                <ForceUpdateButton />
                <Button size="icon" variant="ghost" onClick={signOut} title="Sair">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
