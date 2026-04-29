import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PomodoroHeaderWidget } from "@/components/PomodoroHeaderWidget";
import { HeaderStatsWidget } from "@/components/HeaderStatsWidget";

export function AppLayout({ children }: { children: React.ReactNode }) {
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
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
