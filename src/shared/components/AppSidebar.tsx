import { Zap } from "lucide-react";
import { NavLink } from "@/shared/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, NAV_ITEMS, NavGroupId } from "@/shared/constants/navigation";

const GROUP_ORDER: NavGroupId[] = ["decisao", "operacao", "inteligencia", "planejamento", "configuracoes"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
            <Zap className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-small font-bold text-sidebar-accent-foreground tracking-tight">Performance21</p>
              <p className="text-caption text-sidebar-foreground/60 uppercase tracking-widest">SOC · CRM</p>
            </div>
          )}
        </div>

        {GROUP_ORDER.map((gid) => {
          const items = NAV_ITEMS.filter((n) => n.group === gid);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={gid}>
              <SidebarGroupLabel className="text-caption uppercase tracking-widest text-sidebar-foreground/50">
                {NAV_GROUPS[gid].label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end={item.end}
                            className="hover:bg-sidebar-accent/50 transition-standard"
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          >
                            <Icon className="mr-2 h-4 w-4" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
