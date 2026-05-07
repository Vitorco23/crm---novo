import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2, Check, AlertTriangle } from "lucide-react";
import { getSyncState, onSyncStateChange } from "@/lib/userStorage";

export function SyncStatusBadge() {
  const [state, setState] = useState(getSyncState());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const off = onSyncStateChange(setState);
    const on = () => setOnline(true);
    const ofl = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", ofl);
    return () => {
      off();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", ofl);
    };
  }, []);

  if (!online) return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-destructive" title="Sem conexão">
      <CloudOff className="h-3 w-3" /> Offline
    </span>
  );

  if (state === "syncing") return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground" title="Sincronizando">
      <Loader2 className="h-3 w-3 animate-spin" /> Sync
    </span>
  );
  if (state === "saving") return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground" title="Salvando">
      <Loader2 className="h-3 w-3 animate-spin" /> Salvando
    </span>
  );
  if (state === "error") return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-destructive" title="Erro de sincronização">
      <AlertTriangle className="h-3 w-3" /> Erro
    </span>
  );
  return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground" title="Sincronizado">
      <Check className="h-3 w-3 text-accent" /> Sync
    </span>
  );
}
