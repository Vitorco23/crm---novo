import { PageContainer } from "@/shared/components/shell";

export default function MissaoDoDia() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-700">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground italic uppercase">
            Missão do Dia
          </h1>
          <div className="h-1 w-24 bg-accent mx-auto rounded-full" />
        </div>
        
        <p className="text-muted-foreground text-sm uppercase tracking-[0.3em] font-bold opacity-50">
          Aguardando Início do Sprint 1
        </p>
      </div>
    </PageContainer>
  );
}
