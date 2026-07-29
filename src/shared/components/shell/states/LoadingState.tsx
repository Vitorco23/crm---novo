import { Loader2 } from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label?: string;
  variant?: "spinner" | "skeleton";
  rows?: number;
  className?: string;
}

export function LoadingState({ label = "Carregando…", variant = "spinner", rows = 3, className }: Props) {
  if (variant === "skeleton") {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center gap-2 py-10 text-small text-muted-foreground", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
