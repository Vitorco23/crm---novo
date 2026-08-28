import { ReactNode } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { 
  BarChart3, 
  Target, 
  DollarSign, 
  ListChecks, 
  ChevronRight,
  TrendingUp,
  LayoutDashboard
} from "lucide-react";
import { cn } from "@/shared/utils/utils";

interface ManagementShellProps {
  children?: ReactNode;
  title?: string;
  description?: string;
}

const CATEGORIES = [
  { 
    id: "visao-executiva", 
    label: "Visão Executiva", 
    icon: LayoutDashboard, 
    path: "/dashboard",
    description: "Visão consolidada da gestão comercial"
  },
  { 
    id: "performance", 
    label: "Performance", 
    icon: TrendingUp, 
    path: "/pomodoro",
    description: "Desempenho operacional e produtividade"
  },
  { 
    id: "metas", 
    label: "Metas", 
    icon: Target, 
    path: "/metas",
    description: "Acompanhamento de objetivos e conversão"
  },
  { 
    id: "financeiro", 
    label: "Financeiro", 
    icon: DollarSign, 
    path: "/financeiro",
    description: "Saúde financeira e receitas"
  },
  { 
    id: "plano-acao", 
    label: "Plano de Ação", 
    icon: ListChecks, 
    path: "/scrum",
    description: "Gestão de tarefas e sprints"
  }
];

export function ManagementShell({ children, title, description }: ManagementShellProps) {
  const { pathname } = useLocation();

  // Se não for passado title, tentamos encontrar baseado no path
  const currentCat = CATEGORIES.find(c => c.path === pathname);
  const displayTitle = title || currentCat?.label || "Gestão";
  const displayDesc = description || currentCat?.description;

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <nav className="flex items-center gap-2 text-muted-foreground mb-1 text-xs" aria-label="Breadcrumb">
              <Link to="/dashboard" className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:underline">Gestão</Link>
              {pathname !== "/dashboard" && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-medium">{displayTitle}</span>
                </>
              )}
            </nav>
            <h1 className="text-h2 font-semibold tracking-tight text-foreground">{displayTitle}</h1>
            {displayDesc && <p className="text-small text-muted-foreground">{displayDesc}</p>}
          </div>
          
          <nav className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40" aria-label="Menu de Gestão">
            {CATEGORIES.map((cat) => {
              const isActive = pathname === cat.path;
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
