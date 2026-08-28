import { Zap, ChevronRight } from "lucide-react";
import { NavLink } from "@/shared/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NAV_GROUPS, NAV_ITEMS, NavGroupId } from "@/shared/constants/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

const GROUP_ORDER: NavGroupId[] = ["operacao", "inteligencia", "gestao", "configuracoes"];

export function AppSidebar() {
  const { state } = useSidebar();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-3 px-4 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary shadow-lg shadow-sidebar-primary/20">
            <Zap className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-small font-bold text-sidebar-foreground tracking-tight leading-none">Performance21</span>
              <span className="text-[10px] text-sidebar-foreground/40 font-medium uppercase tracking-[0.2em] mt-1">Revenue Intelligence</span>
            </div>
          )}
        </div>

        {GROUP_ORDER.map((gid) => {
          const items = NAV_ITEMS.filter((n) => {
            if (n.group !== gid) return false;
            if (n.adminOnly && !isAdmin) return false;
            return true;
          });
          
          if (items.length === 0) return null;
          
          return (
            <SidebarGroup key={gid} className="px-3">
              <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-[0.15em] text-sidebar-foreground/30 px-2 mb-2">
                {NAV_GROUPS[gid].label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const hasSubItems = item.subItems && item.subItems.length > 0;
                    const isActive = location.pathname === item.url || item.subItems?.some(s => s.url === location.pathname);

                    if (!hasSubItems) {
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild tooltip={item.title} className="h-9 px-2 rounded-lg transition-all duration-200">
                            <NavLink
                              to={item.url}
                              end={item.end}
                              className="relative flex items-center w-full rounded-lg hover:bg-sidebar-accent/30 text-sidebar-foreground/65 hover:text-sidebar-foreground transition-all duration-200"
                              activeClassName="relative bg-gradient-to-r from-[hsl(var(--brand-green))]/[0.16] to-transparent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-[hsl(var(--brand-green))] before:shadow-[0_0_6px_1px_hsl(var(--brand-green))]"
                            >
                              <Icon className="mr-3 h-4 w-4 shrink-0" />
                              {!collapsed && <span className="text-small">{item.title}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <Collapsible
                        key={item.url}
                        asChild
                        defaultOpen={isActive}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={item.title} className="h-9 px-2 rounded-lg transition-all duration-200">
                              <Icon className="mr-3 h-4 w-4 shrink-0" />
                              {!collapsed && (
                                <>
                                  <span className="text-small text-sidebar-foreground/70 group-hover/collapsible:text-sidebar-foreground">{item.title}</span>
                                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-sidebar-foreground/30" />
                                </>
                              )}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.subItems?.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.url}>
                                  <SidebarMenuSubButton asChild isActive={location.pathname === subItem.url}>
                                    <NavLink 
                                      to={subItem.url}
                                      className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
                                      activeClassName="text-sidebar-accent-foreground font-medium"
                                    >
                                      <span>{subItem.title}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
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
