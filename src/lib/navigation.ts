import {
  PhoneCall, Handshake, Timer, BarChart3, Target, Plug, Rocket, ListChecks,
  DollarSign, Bell, Brain, Compass, FlaskConical, BookMarked,
  Calendar as CalendarIcon, LucideIcon,
} from "lucide-react";

export type NavGroupId = "decisao" | "operacao" | "inteligencia" | "planejamento" | "configuracoes";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  group: NavGroupId;
  end?: boolean;
  description?: string;
}

export const NAV_GROUPS: Record<NavGroupId, { label: string; order: number }> = {
  decisao:        { label: "Decisão",        order: 0 },
  operacao:       { label: "Operação",       order: 1 },
  inteligencia:   { label: "Inteligência",   order: 2 },
  planejamento:   { label: "Planejamento",   order: 3 },
  configuracoes:  { label: "Configurações",  order: 4 },
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Central de Decisão", url: "/central",       icon: Compass,      group: "decisao",       description: "Visão executiva da operação" },

  { title: "Cold Call",          url: "/",              icon: PhoneCall,    group: "operacao",   end: true, description: "Prospecção ativa" },
  { title: "Oportunidades",      url: "/oportunidades", icon: Handshake,    group: "operacao",   description: "Pipeline comercial" },
  { title: "Onboarding",         url: "/onboarding",    icon: Rocket,       group: "operacao",   description: "Implementação de clientes" },
  { title: "Agenda",             url: "/agenda",        icon: CalendarIcon, group: "operacao",   description: "Calendário integrado" },
  { title: "Lembretes",          url: "/lembretes",     icon: Bell,         group: "operacao",   description: "Follow-ups e notificações" },
  { title: "Pomodoro",           url: "/pomodoro",      icon: Timer,        group: "operacao",   description: "Sessões de foco" },

  { title: "Dashboard",              url: "/dashboard",   icon: BarChart3,    group: "inteligencia", description: "Indicadores comerciais" },
  { title: "Inteligência Comercial", url: "/inteligencia", icon: Brain,       group: "inteligencia", description: "Diagnósticos e IA" },
  { title: "Memória Comercial",      url: "/memoria",     icon: BookMarked,   group: "inteligencia", description: "Padrões e aprendizado" },
  { title: "Laboratório",            url: "/laboratorio", icon: FlaskConical, group: "inteligencia", description: "Experimentos A/B" },

  { title: "Tarefas / Scrum", url: "/scrum",     icon: ListChecks, group: "planejamento", description: "Sprints e backlog" },
  { title: "Metas",           url: "/metas",     icon: Target,     group: "planejamento", description: "Objetivos e KPIs" },
  { title: "Financeiro",      url: "/financeiro", icon: DollarSign, group: "planejamento", description: "Receitas e despesas" },

  { title: "Integrações", url: "/integracoes", icon: Plug, group: "configuracoes", description: "Conexões externas" },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const exact = NAV_ITEMS.find((n) => n.url === pathname);
  if (exact) return exact;
  return NAV_ITEMS.find((n) => n.url !== "/" && pathname.startsWith(n.url));
}

export function getBreadcrumb(pathname: string): { label: string; url?: string }[] {
  const item = findNavItem(pathname);
  const crumbs: { label: string; url?: string }[] = [{ label: "Início", url: "/" }];
  if (item && item.url !== "/") {
    const group = NAV_GROUPS[item.group];
    if (group) crumbs.push({ label: group.label });
    crumbs.push({ label: item.title });
  } else if (item) {
    crumbs.push({ label: item.title });
  }
  return crumbs;
}
