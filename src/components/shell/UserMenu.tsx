import { LogOut, Shield, Settings, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

function initials(email?: string | null) {
  if (!email) return "U";
  const [name] = email.split("@");
  return name.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-1.5">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px] font-semibold bg-primary/15 text-primary">
              {initials(user?.email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-label text-foreground max-w-[140px] truncate">
            {user?.email}
          </span>
          {isAdmin && <Shield className="h-3 w-3 text-primary hidden md:inline" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-small font-medium truncate">{user?.email ?? "Convidado"}</span>
            {isAdmin && (
              <span className="text-caption text-primary flex items-center gap-1">
                <Shield className="h-3 w-3" /> Administrador
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/metas")}>
          <UserIcon className="mr-2 h-4 w-4" /> Perfil e metas
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/integracoes")}>
          <Settings className="mr-2 h-4 w-4" /> Integrações
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
