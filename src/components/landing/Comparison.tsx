import { Check, X } from "lucide-react";

const vaidade = [
  "Impressões, likes e alcance",
  "Relatórios bonitos, sem receita",
  "Depende de sorte e trend",
  "Marketing solto do comercial",
  "KPIs que ninguém age em cima",
];
const engenharia = [
  "Reuniões qualificadas por semana",
  "CAC, LTV e receita previsível",
  "Processos, playbooks e cadência",
  "Marketing e vendas no mesmo motor",
  "Indicadores que geram decisão",
];

export function Comparison() {
  return (
    <section className="py-24 border-t border-white/5 bg-[#0a1020]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Comparação</span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
            Marketing de <span className="text-red-400">Vaidade</span> vs{" "}
            <span className="text-[#9abd33]">Engenharia de Receita</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Duas formas de operar. Só uma paga o boleto.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
            <h3 className="text-xl font-semibold text-red-300">Marketing de Vaidade</h3>
            <p className="text-sm text-red-200/70 mt-1">O que a maioria vende como "estratégia".</p>
            <ul className="mt-6 space-y-3">
              {vaidade.map(i => (
                <li key={i} className="flex items-start gap-3 text-slate-300">
                  <X className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#9abd33]/30 bg-[#9abd33]/5 p-8">
            <h3 className="text-xl font-semibold text-[#9abd33]">Engenharia de Receita</h3>
            <p className="text-sm text-[#9abd33]/70 mt-1">O que a Performance21 constrói.</p>
            <ul className="mt-6 space-y-3">
              {engenharia.map(i => (
                <li key={i} className="flex items-start gap-3 text-slate-100">
                  <Check className="h-5 w-5 text-[#9abd33] mt-0.5 shrink-0" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
