import { AlertTriangle, RefreshCw } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Algo deu errado",
  description = "Não conseguimos carregar esta informação agora.",
  onRetry,
  className,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-subtitle font-medium text-foreground">{title}</p>
        <p className="text-small text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar novamente
        </Button>
      )}
    </div>
  );
}
