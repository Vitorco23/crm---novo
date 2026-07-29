import { ReactNode } from "react";
import { LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/shared/utils/utils";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-10",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-subtitle font-medium text-foreground">{title}</p>
        {description && <p className="text-small text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
