const cases = [
  {
    company: "Indústria B2B",
    result: "3,8x",
    metric: "em receita recorrente em 9 meses",
    quote:
      "Estruturaram nosso comercial do zero. Hoje temos previsibilidade e o time bate meta sem depender de heróis.",
    author: "Diretor Comercial",
  },
  {
    company: "SaaS jurídico",
    result: "R$ 4,2M",
    metric: "em novo pipeline qualificado",
    quote:
      "Deixamos de queimar dinheiro em mídia e passamos a operar prospecção com processo. Mudou o jogo.",
    author: "CEO",
  },
  {
    company: "Serviços financeiros",
    result: "68%",
    metric: "de aumento na taxa de conversão",
    quote:
      "Playbook, cadência e indicador semanal. Simples e brutalmente eficiente.",
    author: "Head de Vendas",
  },
];

export function Cases() {
  return (
    <section id="casos" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl">
          <span className="text-xs uppercase tracking-[0.2em] text-[#9abd33]">Casos de sucesso</span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
            Números que pagam boleto.
          </h2>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {cases.map(c => (
            <article
              key={c.company}
              className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-7 flex flex-col"
            >
              <div className="text-4xl font-bold text-[#9abd33]">{c.result}</div>
              <div className="text-sm text-slate-400 mt-1">{c.metric}</div>
              <p className="mt-6 text-slate-200 leading-relaxed">"{c.quote}"</p>
              <div className="mt-6 pt-6 border-t border-white/10 text-sm">
                <div className="text-white font-medium">{c.author}</div>
                <div className="text-slate-500">{c.company}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
