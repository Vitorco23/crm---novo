import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getBreadcrumb } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Props { className?: string }

export function Breadcrumbs({ className }: Props) {
  const { pathname } = useLocation();
  const crumbs = getBreadcrumb(pathname);
  return (
    <nav aria-label="breadcrumb" className={cn("flex items-center gap-1 text-label text-muted-foreground min-w-0", className)}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
            {c.url && !last ? (
              <Link
                to={c.url}
                className="truncate hover:text-foreground transition-standard"
              >
                {c.label}
              </Link>
            ) : (
              <span className={cn("truncate", last && "text-foreground font-medium")}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
