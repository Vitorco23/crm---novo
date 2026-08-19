import React, { useState, useEffect, useCallback } from "react";
import { PageContainer } from "@/shared/components/shell/PageContainer";
import { PageHeader } from "@/shared/components/shell/PageHeader";
import { MessageSquare, AlertCircle, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { whatsappService, WhatsAppStatus, WhatsAppSessionStatus } from "../services/whatsappService";
import { WhatsAppConnection } from "../components/WhatsAppConnection";
import { WhatsAppConnectedState } from "../components/WhatsAppConnectedState";
import { toast } from "sonner";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus>("INITIALIZING");
  const [sessionInfo, setSessionInfo] = useState<WhatsAppSessionStatus | null>(null);
  const [isConfigured] = useState(whatsappService.isConfigured());

  const checkStatus = useCallback(async () => {
    if (!isConfigured) {
      setStatus("ERROR");
      return;
    }

    try {
      const data = await whatsappService.getStatus();
      setStatus(data.status);
      setSessionInfo(data);
    } catch (error) {
      console.error("Error checking WhatsApp status:", error);
      setStatus("ERROR");
    }
  }, [isConfigured]);

  useEffect(() => {
    checkStatus();
    
    // In a real implementation, we would set up SSE/WebSocket here.
    // For Sprint 1, we'll just do a basic poll or manual refresh.
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleConnect = async () => {
    try {
      setStatus("INITIALIZING");
      await whatsappService.startSession();
      checkStatus();
    } catch (error) {
      toast.error("Erro ao iniciar conexão");
      setStatus("ERROR");
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Tem certeza que deseja desconectar este WhatsApp do CRM?")) return;

    try {
      await whatsappService.logout();
      toast.success("WhatsApp desconectado");
      checkStatus();
    } catch (error) {
      toast.error("Erro ao desconectar");
    }
  };

  return (
    <PageContainer>
      <PageHeader 
        title="WhatsApp" 
        description="Gerencie sua conexão e comunicações via WhatsApp"
        icon={<MessageSquare className="h-5 w-5 text-accent" />}
      />

      <div className="max-w-4xl mx-auto space-y-6">
        {!isConfigured ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuração Necessária</AlertTitle>
            <AlertDescription>
              Servidor do WhatsApp ainda não configurado. Por favor, defina a variável VITE_WHATSAPP_API_URL.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {status === "CONNECTED" ? (
              <WhatsAppConnectedState 
                sessionInfo={sessionInfo} 
                onDisconnect={handleDisconnect} 
              />
            ) : (
              <WhatsAppConnection 
                status={status} 
                onConnect={handleConnect}
                onRetry={checkStatus}
              />
            )}

            {status === "CONNECTED" && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground italic">
                    Central de Atendimento (Próxima Sprint)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-40 flex items-center justify-center border-t border-dashed bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    O histórico de conversas e envio de mensagens estarão disponíveis na Sprint 2.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
