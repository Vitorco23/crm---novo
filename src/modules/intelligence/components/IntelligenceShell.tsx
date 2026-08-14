import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { 
  Compass, 
  MessageCircle, 
  Library, 
  BookMarked, 
  FlaskConical, 
  ChevronRight 
} from "lucide-react";
import { cn } from "@/shared/utils/utils";

interface IntelligenceShellProps {
  children: ReactNode;
  title: string;
  description?: string;
}

const CATEGORIES = [
  { 
    id: "decisao", 
    label: "Decisão", 
    icon: Compass, 
    path: "/central",
    description: "Comando operacional e prioridades"
  },
  { 
    id: "conversar", 
    label: "Conversar", 
    icon: MessageCircle, 
    path: "/inteligencia/central",
    description: "Chat com especialistas de IA"
  },
  { 
    id: "conhecimento", 
    label: "Conhecimento", 
    icon: Library, 
    path: "/inteligencia/knowledge",
    description: "Base de documentos RAG"
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
  const { pathname } = useLocation();

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Link to="/inteligencia" className="hover:text-foreground transition-colors">Inteligência</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{title}</span>
            </div>
            <h1 className="text-h2 font-bold tracking-tight text-foreground">{title}</h1>
            {description && <p className="text-small text-muted-foreground">{description}</p>}
          </div>
          
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
            {CATEGORIES.map((cat) => {
              const isActive = pathname === cat.path;
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.id}
                  to={cat.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    isActive 
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title={cat.description}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="hidden sm:inline">{cat.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <div className="min-h-[calc(100vh-250px)]">
        {children}
      </div>
    </PageContainer>
  );
}
