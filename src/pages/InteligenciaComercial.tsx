import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, FlaskConical } from "lucide-react";

export default function InteligenciaComercial() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-accent/15 text-accent flex items-center justify-center">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inteligência Comercial</h1>
          <p className="text-sm text-muted-foreground">
            Análises históricas e comparativas para apoiar decisões estratégicas da operação.
          </p>
        </div>
      </header>

      <section className="grid gap-4">
        <Card className="border-l-4 border-l-accent">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Teste A/B de Scripts</CardTitle>
                <CardDescription>
                  Compare variações de script de abordagem para identificar qual gera mais conexões,
                  decisores e reuniões.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Em breve
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Este módulo está preparado para receber as próximas funcionalidades de configuração e
              análise de variantes de script.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
