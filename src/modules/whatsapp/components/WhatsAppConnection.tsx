import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, Smartphone, RefreshCcw } from "lucide-react";
import { WhatsAppStatus, whatsappService } from "../services/whatsappService";
import { WhatsAppQRCode } from "./WhatsAppQRCode";

interface WhatsAppConnectionProps {
  status: WhatsAppStatus;
  onConnect: () => void;
  onRetry: () => void;
}

export function WhatsAppConnection({ status, onConnect, onRetry }: WhatsAppConnectionProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  useEffect(() => {
    if (status === "WAITING_QR") {
      fetchQR();
    } else {
      setQrCode(null);
    }
  }, [status]);

  const fetchQR = async () => {
    setLoadingQr(true);
    try {
      const data = await whatsappService.getQR();
      setQrCode(data.qr);
    } catch (error) {
      console.error("Error fetching QR Code:", error);
    } finally {
      setLoadingQr(false);
    }
  };

  if (status === "INITIALIZING" || status === "AUTHENTICATING") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-accent" />
          <div className="space-y-2">
            <h3 className="text-lg font-medium">
              {status === "INITIALIZING" ? "Preparando conexão..." : "Autenticando..."}
            </h3>
            <p className="text-sm text-muted-foreground">
              {status === "INITIALIZING" 
                ? "Estamos preparando a conexão com o WhatsApp. Aguarde um momento."
                : "Escaneamento detectado. Autenticando sua sessão..."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "WAITING_QR") {
    return (
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Conectar WhatsApp</CardTitle>
            <CardDescription>
              Abra o WhatsApp no celular e escaneie o QR Code para vincular seu dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-bold">1</div>
                <p className="text-sm">Abra o WhatsApp no seu celular</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-bold">2</div>
                <p className="text-sm">Acesse <strong>Aparelhos conectados</strong> no menu ou configurações</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-bold">3</div>
                <p className="text-sm">Toque em <strong>Conectar aparelho</strong></p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-bold">4</div>
                <p className="text-sm">Aponte a câmera para esta tela para escanear o código</p>
              </div>
            </div>
            
            <div className="pt-4 border-t border-muted">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5" />
                Aguardando leitura do QR Code...
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900">
          <WhatsAppQRCode qr={qrCode} loading={loadingQr} onRefresh={fetchQR} />
        </Card>
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <Card className="w-full max-w-md mx-auto border-destructive/20 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Não foi possível conectar</h3>
            <p className="text-sm text-muted-foreground">
              Ocorreu um erro ao tentar estabelecer conexão com o servidor do WhatsApp.
            </p>
          </div>
          <Button variant="outline" onClick={onRetry} className="mt-4">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "RECONNECTING") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-yellow-500" />
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Reconectando...</h3>
            <p className="text-sm text-muted-foreground">
              A conexão foi interrompida. Estamos tentando restaurar sua sessão automaticamente.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // DISCONNECTED state
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">WhatsApp</CardTitle>
        <CardDescription className="text-base">
          Conecte seu WhatsApp para enviar e receber mensagens diretamente pelo CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6 pb-12">
        <div className="h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center">
          <QrCode className="h-12 w-12 text-accent" />
        </div>
        
        <Button size="lg" onClick={onConnect} className="w-full max-w-xs font-bold text-lg">
          Conectar WhatsApp
        </Button>
        
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground italic">
            Você continuará utilizando seu WhatsApp normalmente no celular.
          </p>
          <p className="text-xs text-muted-foreground">
            A conexão será realizada como um dispositivo vinculado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
