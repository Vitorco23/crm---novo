import { Button } from "@/components/ui/button";
import { useLandingCta } from "./LandingShell";
import { ArrowRight } from "lucide-react";

export function Hero() {
  const { openSoon } = useLandingCta();
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(600px 300px at 20% 10%, rgba(154,189,51,0.15), transparent 60%), radial-gradient(500px 300px at 80% 30%, rgba(21,32,57,0.9), transparent 60%)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-28 md:pt-28 md:pb-36">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#9abd33] border border-[#9abd33]/30 rounded-full px-3 py-1">
            Engenharia de Receita
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
            Chega de marketing de vaidade.<br />
            <span className="text-[#9abd33]">Receita previsível</span> é engenharia.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-300 max-w-2xl">
            A Performance21 constrói máquinas comerciais para empresas B2B que querem
            crescer com previsibilidade — sem depender de sorte, de trend ou de agências
            que entregam relatório bonito e caixa vazio.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => openSoon("hero-diagnostico")}
              size="lg"
              className="bg-[#9abd33] text-[#0b1120] hover:bg-[#88a82c] font-semibold h-12 px-6"
            >
              Quero um diagnóstico gratuito
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              onClick={() => openSoon("hero-metodologia")}
              variant="outline"
              size="lg"
              className="h-12 px-6 border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
            >
              Ver metodologia
            </Button>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg">
            {[
              ["+R$120M", "gerados para clientes"],
              ["+300", "operações estruturadas"],
              ["9 anos", "de mercado B2B"],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="text-2xl md:text-3xl font-bold text-white">{n}</div>
                <div className="text-xs md:text-sm text-slate-400 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
