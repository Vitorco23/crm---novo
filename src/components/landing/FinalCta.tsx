import { Button } from "@/components/ui/button";
import { useLandingCta } from "./LandingShell";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  const { openSoon } = useLandingCta();
  return (
    <section className="py-28 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(700px 300px at 50% 0%, rgba(154,189,51,0.15), transparent 60%)",
        }}
      />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
          Pronto para parar de <span className="text-red-400">brincar de marketing</span>{" "}
          e começar a <span className="text-[#9abd33]">engenheirar receita</span>?
        </h2>
        <p className="mt-6 text-slate-300 text-lg">
          Agende um diagnóstico gratuito de 30 minutos com nosso time.
          Sem venda forçada. Sem enrolação.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => openSoon("final-diagnostico")}
            size="lg"
            className="bg-[#9abd33] text-[#0b1120] hover:bg-[#88a82c] font-semibold h-12 px-6"
          >
            Quero meu diagnóstico gratuito
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            onClick={() => openSoon("final-contato")}
            variant="outline"
            size="lg"
            className="h-12 px-6 border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
          >
            Falar com um consultor
          </Button>
        </div>
      </div>

      <footer className="mt-24 border-t border-white/5 pt-8 pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[#9abd33]" />
            <span>Performance<span className="text-[#9abd33]">21</span> · Engenharia de Receita</span>
          </div>
          <div>© {new Date().getFullYear()} Performance21. Todos os direitos reservados.</div>
        </div>
      </footer>
    </section>
  );
}
