import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Phone, User, Clock, LogOut } from "lucide-react";
import { WhatsAppSessionStatus } from "../services/whatsappService";
import { Badge } from "@/components/ui/badge";

interface WhatsAppConnectedStateProps {
  sessionInfo: WhatsAppSessionStatus | null;
  onDisconnect: () => void;
}

export function WhatsAppConnectedState({ sessionInfo, onDisconnect }: WhatsAppConnectedStateProps) {
  return (
    <Card className="border-accent/20 bg-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-accent" />
            </div>
            <div>
              <CardTitle className="text-xl">WhatsApp Conectado</CardTitle>
              <Badge className="bg-accent/20 text-accent border-accent/40 mt-1">
                Ativo
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onDisconnect} className="text-destructive hover:bg-destructive/10 border-destructive/20">
            <LogOut className="h-4 w-4 mr-2" />
            Desconectar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-accent/10">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-muted">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Perfil</p>
              <p className="text-sm font-medium">{sessionInfo?.name || "Não identificado"}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-muted">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Número</p>
              <p className="text-sm font-medium">{sessionInfo?.phone || "Não disponível"}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Última Conexão</p>
              <p className="text-sm font-medium">
                {sessionInfo?.lastConnection ? new Date(sessionInfo.lastConnection).toLocaleTimeString() : "Agora"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
