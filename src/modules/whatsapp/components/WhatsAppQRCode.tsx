import React from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhatsAppQRCodeProps {
  qr: string | null;
  loading: boolean;
  onRefresh: () => void;
}

export function WhatsAppQRCode({ qr, loading, onRefresh }: WhatsAppQRCodeProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground animate-pulse">Gerando código...</p>
      </div>
    );
  }

  if (!qr) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <div className="h-48 w-48 bg-muted rounded flex items-center justify-center border-2 border-dashed">
          <RefreshCcw className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">O código expirou ou não pôde ser gerado.</p>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCcw className="h-3.5 w-3.5 mr-2" />
          Gerar novo código
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-lg border-4 border-accent/20">
        {/* In a real implementation, we would use a library like qrcode.react */}
        {/* For now, we assume the backend sends an image URL or base64 */}
        {qr.startsWith('http') || qr.startsWith('data:image') ? (
          <img src={qr} alt="WhatsApp QR Code" className="h-64 w-64" />
        ) : (
          <div className="h-64 w-64 bg-slate-100 flex items-center justify-center text-center p-4">
            <p className="text-xs text-slate-500 font-mono break-all">{qr}</p>
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onRefresh} className="text-muted-foreground">
        <RefreshCcw className="h-3 w-3 mr-2" />
        Atualizar QR Code
      </Button>
    </div>
  );
}
