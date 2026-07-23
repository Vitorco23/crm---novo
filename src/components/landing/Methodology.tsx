import { Target, Compass, Cog, LineChart, Rocket } from "lucide-react";

const items = [
  {
    icon: Target,
    title: "Posicionamento",
    desc: "Definir para quem se vende, com que dor e com que promessa. Sem posicionamento, não existe processo.",
  },
  {
    icon: Compass,
    title: "Oferta",
    desc: "Construir uma oferta irresistível, com preço, escopo e prova. O comercial começa antes da ligação.",
  },
  {
    icon: Cog,
    title: "Processo",
    desc: "Cadência de prospecção, qualificação e follow-up. Playbook que qualquer vendedor executa.",
  },
  {
    icon: LineChart,
    title: "Indicador",
    desc: "Do lead à receita: métricas que geram decisão semanal, não relatório de fim de mês.",
  },
  {
    icon: Rocket,
    title: "Execução",
    desc: "Rotina, ritmo e responsabilização. É o que separa quem planeja de quem entrega.",
  },
];

export function Methodology() {
  return (
    <section id="metodologia" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl">
          <span className="text-xs uppercase tracking-[0.2em] text-[#9abd33]">Metodologia</span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
            Os 5 fundamentos da Engenharia de Receita
          </h2>
          <p className="mt-4 text-slate-400">
            Cada operação comercial que a Performance21 estrutura passa por esses cinco pilares.
            Fora dessa ordem, nenhuma agência ou vendedor sustenta resultado.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#9abd33]/40 hover:bg-[#9abd33]/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#9abd33]/10 border border-[#9abd33]/30 flex items-center justify-center text-[#9abd33]">
                  <it.icon className="h-5 w-5" />
                </div>
                <div className="text-xs text-slate-500 font-mono">0{i + 1}</div>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{it.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
