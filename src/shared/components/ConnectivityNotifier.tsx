import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { syncFromCloud } from "@/shared/services/userStorage";
import {
  CLOUD_SYNC_DELAYED_EVENT,
  CLOUD_SYNC_RECOVERED_EVENT,
} from "@/shared/services/syncStatus";

const CONNECTIVITY_TOAST_ID = "p21-connectivity";
const CLOUD_SYNC_TOAST_ID = "p21-cloud-sync-status";

export function ConnectivityNotifier() {
  const recoveryRunning = useRef(false);

  useEffect(() => {
    const notifyOffline = () => {
      toast.warning("Sem conexão. O CRM continuará usando os dados locais.", {
        id: CONNECTIVITY_TOAST_ID,
        duration: 6_000,
      });
    };

    const recoverOnline = () => {
      if (recoveryRunning.current) return;
      recoveryRunning.current = true;

      toast.loading("Conexão restabelecida. Sincronizando dados…", {
        id: CONNECTIVITY_TOAST_ID,
      });

      void syncFromCloud()
        .then((changed) => {
          if (changed) window.dispatchEvent(new Event("p21:storage-synced"));
          toast.success("Dados sincronizados com o Lovable Cloud.", {
            id: CONNECTIVITY_TOAST_ID,
            duration: 4_000,
          });
        })
        .catch(() => {
          toast.error("A sincronização ainda não foi concluída. Seus dados locais permanecem disponíveis.", {
            id: CONNECTIVITY_TOAST_ID,
            duration: 8_000,
          });
        })
        .finally(() => {
          recoveryRunning.current = false;
        });
    };

    const notifyDelayed = () => {
      toast.info("Dados locais carregados. O Lovable Cloud continua sincronizando em segundo plano.", {
        id: CLOUD_SYNC_TOAST_ID,
        duration: 6_000,
      });
    };

    const notifyRecovered = () => {
      toast.success("Sincronização com o Lovable Cloud concluída.", {
        id: CLOUD_SYNC_TOAST_ID,
        duration: 4_000,
      });
    };

    const notifyCloudError = () => {
      toast.error("Não foi possível salvar na nuvem agora. A alteração permanece protegida localmente.", {
        id: CLOUD_SYNC_TOAST_ID,
        duration: 8_000,
      });
    };

    window.addEventListener("offline", notifyOffline);
    window.addEventListener("online", recoverOnline);
    window.addEventListener(CLOUD_SYNC_DELAYED_EVENT, notifyDelayed);
    window.addEventListener(CLOUD_SYNC_RECOVERED_EVENT, notifyRecovered);
    window.addEventListener("p21:cloud-sync-error", notifyCloudError);

    if (!navigator.onLine) notifyOffline();

    return () => {
      window.removeEventListener("offline", notifyOffline);
      window.removeEventListener("online", recoverOnline);
      window.removeEventListener(CLOUD_SYNC_DELAYED_EVENT, notifyDelayed);
      window.removeEventListener(CLOUD_SYNC_RECOVERED_EVENT, notifyRecovered);
      window.removeEventListener("p21:cloud-sync-error", notifyCloudError);
    };
  }, []);

  return null;
}
