import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncInboundLeads } from "@/shared/services/userStorage";
import { toast } from "sonner";

let inboundSyncRunning = false;
let inboundSyncPending = false;

/**
 * Executa a sincronização de leads inbound com lock para evitar concorrência.
 */
async function performInboundSync() {
  if (inboundSyncRunning) {
    inboundSyncPending = true;
    return;
  }

  inboundSyncRunning = true;
  inboundSyncPending = false;

  console.log("[inbound-realtime] sync_start");
  try {
    const count = await syncInboundLeads();
    console.log(`[inbound-realtime] imported: ${count}`);
    
    if (count > 0) {
      if (count === 1) {
        toast.success("Novo lead recebido pela Landing Page");
      } else {
        toast.success(`${count} novos leads recebidos pela Landing Page`);
      }
      // Dispara evento para o pipeline atualizar (refreshKey no Oportunidades.tsx)
      window.dispatchEvent(new Event("p21:leads-changed"));
    }
  } catch (error) {
    console.error("[inbound-realtime] sync_failed", error);
  } finally {
    console.log("[inbound-realtime] sync_complete");
    inboundSyncRunning = false;
    
    // Se houve uma solicitação de sync enquanto esta estava rodando, executa novamente.
    if (inboundSyncPending) {
      void performInboundSync();
    }
  }
}

/**
 * Hook global para ouvir novos inserts na tabela leads_inbound via Supabase Realtime.
 * Deve ser instanciado em um ponto global da aplicação (ex: AppLayout ou AuthProvider).
 */
export function useInboundLeadRealtime() {
  useEffect(() => {
    console.log("[inbound-realtime] initializing subscription");

    // Sincronização inicial ao montar o componente
    void performInboundSync();

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
          void performInboundSync();
        }
      )
      .subscribe((status) => {
        console.log(`[inbound-realtime] status: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("[inbound-realtime] subscribed");
        }
        if (status === "CHANNEL_ERROR") {
          console.error("[inbound-realtime] channel error");
        }
      });

    // Ao reconectar, o Supabase Realtime tenta restabelecer o canal.
    // Mas para garantir que não perdemos nada durante o offline, 
    // podemos ouvir mudanças de visibilidade ou status do Supabase se necessário.
    // O próprio .subscribe() tenta reconectar automaticamente.

    return () => {
      console.log("[inbound-realtime] unsubscribing");
      void supabase.removeChannel(channel);
    };
  }, []);
}
