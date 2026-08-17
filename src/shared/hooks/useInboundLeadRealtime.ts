import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncInboundLeads } from "@/shared/services/userStorage";
import { toast } from "sonner";

/**
 * Hook global para ouvir novos inserts na tabela leads_inbound via Supabase Realtime.
 * Implementa catch-up automático após conexão/reconexão.
 */
export function useInboundLeadRealtime() {
  const isSubscribed = useRef(false);

  useEffect(() => {
    console.log("[inbound-realtime] initializing subscription");

    const handleSync = async () => {
      try {
        const count = await syncInboundLeads();
        if (count > 0) {
          toast.success(
            count === 1 
              ? "Novo lead recebido pela Landing Page" 
              : `${count} novos leads recebidos pela Landing Page`
          );
        }
      } catch (error) {
        console.error("[inbound-realtime] sync_failed", error);
      }
    };

    const channel = supabase
      .channel("public:leads_inbound")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads_inbound",
        },
        (payload) => {
          console.log("[inbound-realtime] insert_received", payload.new.id);
          void handleSync();
        }
      )
      .subscribe((status) => {
        console.log(`[inbound-realtime] status: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("[inbound-realtime] subscribed/catch-up");
          isSubscribed.current = true;
          // Catch-up após conexão ou reconexão
          void handleSync();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          isSubscribed.current = false;
        }
      });

    // Fallback para quando a aba volta a ficar visível ou volta a ficar online
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void handleSync();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleSync);

    return () => {
      console.log("[inbound-realtime] unsubscribing");
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleSync);
      void supabase.removeChannel(channel);
    };
  }, []);
}
