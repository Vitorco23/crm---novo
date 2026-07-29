import { CheckCircle2 } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SuccessState({ title = "Tudo certo", description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 rounded-lg border border-success/30 bg-success/5 px-6 py-8",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-subtitle font-medium text-foreground">{title}</p>
        {description && <p className="text-small text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
