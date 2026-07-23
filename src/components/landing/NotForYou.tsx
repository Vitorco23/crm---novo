import { AlertTriangle } from "lucide-react";

const items = [
  "Quem busca solução mágica em 7 dias.",
  "Quem não quer olhar o próprio processo comercial.",
  "Quem confunde marketing com postagem de rede social.",
  "Quem não tem oferta minimamente validada.",
  "Quem quer terceirizar 100% do resultado.",
];

export function NotForYou() {
  return (
    <section className="py-24 bg-[#0a1020] border-y border-white/5">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-yellow-400">Transparência</span>
        </div>
        <h2 className="mt-6 text-3xl md:text-5xl font-bold tracking-tight">
          Para quem a Performance21 <span className="text-yellow-400">não é</span>
        </h2>
        <p className="mt-4 text-slate-400 max-w-2xl">
          Preferimos perder um contrato do que aceitar um cliente que não vai colher resultado.
          Se você se identificar com algum dos itens abaixo, esse não é o momento.
        </p>

        <ul className="mt-10 space-y-3">
          {items.map(i => (
            <li
              key={i}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 text-slate-200 flex items-start gap-3"
            >
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
