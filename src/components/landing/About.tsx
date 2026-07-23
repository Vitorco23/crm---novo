export function About() {
  return (
    <section id="sobre" className="py-24 bg-[#0a1020] border-y border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-14 items-start">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[#9abd33]">Sobre</span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
            Nascemos para consertar operações comerciais.
          </h2>
          <p className="mt-6 text-slate-300 leading-relaxed">
            A Performance21 é uma consultoria de Engenharia de Receita para empresas B2B.
            Trabalhamos lado a lado com fundadores, diretores comerciais e times de vendas
            que querem parar de improvisar e começar a operar com processo, indicador e
            previsibilidade.
          </p>
          <p className="mt-4 text-slate-400 leading-relaxed">
            Nada de dashboard bonito. Nada de fórmula mágica. Estruturamos o motor
            comercial, treinamos o time, implantamos rotina e ficamos junto até o
            resultado aparecer no caixa.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            ["+9 anos", "de operação B2B"],
            ["+300", "empresas atendidas"],
            ["+R$120M", "gerados em receita"],
            ["27 países", "em projetos ativos"],
          ].map(([n, l]) => (
            <div
              key={l}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              <div className="text-3xl font-bold text-white">{n}</div>
              <div className="text-sm text-slate-400 mt-1">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
