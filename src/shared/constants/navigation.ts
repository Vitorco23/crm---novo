import {
  PhoneCall, Handshake, Timer, BarChart3, Target, Plug, Rocket, ListChecks,
  DollarSign, Bell, Brain, Compass, FlaskConical, BookMarked,
  Calendar as CalendarIcon, Library, LucideIcon, ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HOME_AREA_LABEL, HOME_AREA_ROUTE, HOME_AREA_DESCRIPTION } from "@/modules/intelligence/constants/homeArea";

export type NavGroupId = "operacao" | "inteligencia" | "gestao" | "configuracoes";

export interface NavSubItem {
  title: string;
  url: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  group: NavGroupId;
  end?: boolean;
  description?: string;
  subItems?: NavSubItem[];
  adminOnly?: boolean;
}

export const NAV_GROUPS: Record<NavGroupId, { label: string; order: number }> = {
  operacao:       { label: "Operação",       order: 0 },
  inteligencia:   { label: "Inteligência",   order: 1 },
  gestao:         { label: "Gestão",         order: 2 },
  configuracoes:  { label: "Configurações",  order: 3 },
};

export const NAV_ITEMS: NavItem[] = [
  // Sprint 3 — nova Home conversacional, primeiro item da navegação.
  // Missão do Dia saiu da navegação principal (rota/serviços preservados,
  // ver src/App.tsx e src/modules/intelligence/pages/MissaoDoDia.tsx).
  {
    title: HOME_AREA_LABEL,
    url: HOME_AREA_ROUTE,
    icon: Sparkles,
    group: "operacao",
    end: true,
    description: HOME_AREA_DESCRIPTION,
  },
  // OPERAÇÃO
  {
    title: "Cold Call",
    url: "/cold-call",      
    icon: PhoneCall,    
    group: "operacao",   
    end: true, 
    description: "Prospecção ativa" 
  },
  { 
    title: "Pipeline",      
    url: "/oportunidades", 
    icon: Handshake,    
    group: "operacao",   
    description: "Pipeline comercial e Onboarding",
    subItems: [
      { title: "Oportunidades", url: "/oportunidades" },
      { title: "Onboarding", url: "/onboarding" }
    ]
  },
  { 
    title: "Agenda",             
    url: "/agenda",        
    icon: CalendarIcon, 
    group: "operacao",   
    description: "Calendário integrado",
    subItems: [
      { title: "Calendário", url: "/agenda" },
      { title: "Lembretes", url: "/lembretes" },
      { title: "Pomodoro", url: "/pomodoro" }
    ]
  },
  // "WhatsApp" (gestão de conexão QR) saiu do menu principal — auditoria de
  // 2026-08-30: aponta para um servidor próprio (whatsapp-server/, sessão
  // via whatsapp-web.js) que nunca foi hospedado/configurado
  // (VITE_WHATSAPP_API_URL ausente), então a tela só mostrava erro de
  // configuração. É um recurso DIFERENTE do webhook whatsapp-agent-update-lead
  // (esse já está em produção — recebe status do agente externo de disparo).
  // Rota (/whatsapp) e componente preservados; só some do menu até alguém
  // hospedar o servidor e configurar a variável.

  // INTELIGÊNCIA
  { 
    title: "Inteligência", 
    url: "/inteligencia", 
    icon: Brain, 
    group: "inteligencia", 
    description: "Cockpit de IA e Decisão",
    subItems: [
      { title: "Visão Geral", url: "/inteligencia" },
      { title: "Decisão", url: "/central" },
      { title: "Métricas", url: "/inteligencia/metricas" },
      { title: "Memória", url: "/memoria" },
      { title: "Laboratório", url: "/laboratorio" }
    ]
  },


  // GESTÃO
  { 
    title: "Dashboard",              
    url: "/dashboard",   
    icon: BarChart3,    
    group: "gestao", 
    description: "Indicadores comerciais" 
  },
  { 
    title: "Plano de ação", 
    url: "/scrum",     
    icon: ListChecks, 
    group: "gestao", 
    description: "Sprints e backlog (Scrum)" 
  },
  { 
    title: "Performance",           
    url: "/metas",     
    icon: Target,     
    group: "gestao", 
    description: "Metas e Financeiro",
    subItems: [
      { title: "Metas", url: "/metas" },
      { title: "Financeiro", url: "/financeiro" }
    ]
  },

  // CONFIGURAÇÕES
  { 
    title: "Integrações", 
    url: "/integracoes", 
    icon: Plug, 
    group: "configuracoes", 
    description: "Conexões externas" 
  },
  { 
    title: "Sistema", 
    url: "/saude-sistema", 
    icon: ShieldCheck, 
    group: "configuracoes", 
    description: "Saúde e Auditoria",
    adminOnly: true
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const exact = NAV_ITEMS.find((n) => n.url === pathname);
  if (exact) return exact;
  
  // Check subitems
  for (const item of NAV_ITEMS) {
    if (item.subItems?.find(s => s.url === pathname)) return item;
  }

  return NAV_ITEMS.find((n) => n.url !== "/" && pathname.startsWith(n.url));
}

export function getBreadcrumb(pathname: string): { label: string; url?: string }[] {
  const item = findNavItem(pathname);
  const crumbs: { label: string; url?: string }[] = [{ label: "Início", url: "/" }];
  
  if (item && item.url !== "/") {
    const group = NAV_GROUPS[item.group];
    if (group) crumbs.push({ label: group.label });
    crumbs.push({ label: item.title, url: item.url });
    
    // Check if it's a subitem
    const subItem = item.subItems?.find(s => s.url === pathname);
    if (subItem && subItem.url !== item.url) {
      crumbs.push({ label: subItem.title });
    }
  } else if (item) {
    crumbs.push({ label: item.title });
  }
  return crumbs;
}
