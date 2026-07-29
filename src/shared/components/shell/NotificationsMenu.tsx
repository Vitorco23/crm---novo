import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

/**
 * Estrutura visual do centro de notificações.
 * O feed real (lembretes, follow-ups) é ligado nas próximas sprints — por ora
 * este menu apenas oferece atalhos e um estado vazio consistente.
 */
export function NotificationsMenu() {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Notificações">
          <Bell className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-3 py-6 text-center text-small text-muted-foreground">
          Nenhuma novidade por aqui.
          <div className="text-caption mt-1 opacity-70">Você está em dia.</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/lembretes")}>
          Abrir lembretes
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/agenda")}>
          Ver agenda
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
