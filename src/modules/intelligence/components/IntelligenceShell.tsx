import { ReactNode } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { 
  Compass, 
  MessageCircle, 
  Library, 
  BookMarked, 
  FlaskConical, 
  ChevronRight,
  LayoutDashboard,
  Sparkles,
  BarChart3
} from "lucide-react";
import { cn } from "@/shared/utils/utils";
import P21Signal from "@/modules/intelligence/components/P21Signal";

interface IntelligenceShellProps {
  children?: ReactNode;
  title?: string;
  description?: string;
}

const CATEGORIES = [
  { 
    id: "visao-geral", 
    label: "Visão Geral", 
    icon: LayoutDashboard, 
    path: "/inteligencia",
    description: "Visão consolidada da inteligência"
  },
  { 
    id: "decisao", 
    label: "Decisão", 
    icon: Compass, 
    path: "/central",
    description: "Comando operacional e prioridades"
  },
  { 
    id: "metricas", 
    label: "Métricas", 
    icon: BarChart3, 
    path: "/inteligencia/metricas",
    description: "Fechamento diário da operação"
  },
  { 
    id: "memoria", 
    label: "Memória", 
    icon: BookMarked, 
    path: "/memoria",
    description: "Aprendizados históricos"
  },
  { 
    id: "laboratorio", 
    label: "Laboratório", 
    icon: FlaskConical, 
    path: "/laboratorio",
    description: "Experimentos e rankings"
  }
];

export function IntelligenceShell({ children, title, description }: IntelligenceShellProps) {
  const { pathname, search } = useLocation();
  const fullPath = pathname + search;

  // Se não for passado title, tentamos encontrar baseado no path
  const currentCat = CATEGORIES.find(c => c.path === fullPath || c.path === pathname);
  const displayTitle = title || currentCat?.label || "Inteligência";
  const displayDesc = description || currentCat?.description;

  return (
    <PageContainer className="space-y-6">
      <header
        className="relative space-y-4 -mx-1 rounded-2xl px-4 py-4 md:px-5"
        style={{
          background: "radial-gradient(ellipse 80% 100% at 92% 0%, hsl(var(--mission-accent) / 0.06), transparent 55%)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <P21Signal label="P21 Intelligence" />
            <nav className="flex items-center gap-2 text-muted-foreground text-xs" aria-label="Breadcrumb">
              <Link to="/inteligencia" className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:underline">Inteligência</Link>
              {pathname !== "/inteligencia" && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-medium">{displayTitle}</span>
                </>
              )}
            </nav>
            <h1 className="text-h2 font-semibold tracking-tight text-foreground">{displayTitle}</h1>
            {displayDesc && <p className="text-small text-muted-foreground">{displayDesc}</p>}
          </div>
          
          <nav className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40" aria-label="Menu de Inteligência">
            {CATEGORIES.map((cat) => {
              const isActive = fullPath === cat.path || (cat.path === pathname && !search);
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.id}
                  to={cat.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isActive 
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title={cat.description}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="hidden sm:inline">{cat.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="min-h-[calc(100vh-250px)]">
        {children || <Outlet />}
      </div>
    </PageContainer>
  );
}
