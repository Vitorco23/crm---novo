import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { forceUpdatePWA } from "@/pwa/registerSW";
import { toast } from "sonner";

export function ForceUpdateButton() {
  const handleClick = async () => {
    toast.info("Buscando última versão…");
    try {
      await forceUpdatePWA();
    } catch {
      window.location.reload();
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleClick}
      title="Forçar atualização"
    >
      <RefreshCw className="h-4 w-4" />
    </Button>
  );
}
