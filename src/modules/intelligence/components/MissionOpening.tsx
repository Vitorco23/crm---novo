// Abertura Inteligente da Missão do Dia — substitui o cabeçalho estático por
// uma leitura executiva da operação, derivada só de dados já calculados pelo
// priorityEngine/missionPlanner (nenhum motor novo, nenhum texto inventado).

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveDisplayName, useProfile } from "@/shared/hooks/useProfile";

interface MissionOpeningProps {
  actionCount: number;
  urgentCount: number;
  generatedAt: string;
  onStart?: () => void;
}

function greetingWord(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function MissionOpening({ actionCount, urgentCount, generatedAt, onStart }: MissionOpeningProps) {
  const { user } = useAuth();
  const { profile } = useProfile();

  // Nunca usar o prefixo do e-mail como nome — só display_name/first_name do
  // perfil ou user_metadata.full_name já existente no Auth. Sem nenhum dos
  // três, cai para "Bom dia."/"Boa tarde."/"Boa noite." sem nome.
  const firstName = resolveDisplayName(profile, user);

  const greeting = `${greetingWord(new Date().getHours())}${firstName ? `, ${firstName}` : ""}.`;

  const analyzedAt = useMemo(() => {
    const d = new Date(generatedAt);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [generatedAt]);

  const recommendation =
    actionCount === 0
      ? "Nenhuma prioridade crítica agora. Você pode iniciar seu bloco de prospecção."
      : urgentCount > 0
        ? `Recomendo resolver primeiro ${urgentCount === 1 ? "o retorno urgente" : `os ${urgentCount} retornos urgentes`} e depois seguir para o restante da fila.`
        : "Nenhum retorno crítico pendente — siga pela fila de prioridades abaixo.";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[hsl(var(--brand-green))]/25 bg-gradient-to-br from-[hsl(var(--console-bg))] to-[hsl(var(--console-bg-strong))] px-6 py-7 text-[hsl(var(--console-fg))] shadow-sm animate-fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, currentColor 1px, transparent 1px), linear-gradient(0deg, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--console-fg))]/55">
            Performance21 // Sistema Operacional
          </p>
          <div className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--brand-green))]/30 bg-black/10 px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-green rounded-full bg-[hsl(var(--brand-green))]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-green))]" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--console-fg))]/80">
              Operação analisada{analyzedAt ? ` às ${analyzedAt}` : ""}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--console-fg))]">{greeting}</h1>
          <p className="text-sm md:text-[15px] text-[hsl(var(--console-fg))]/85 max-w-2xl">
            Analisei sua operação. Você tem{" "}
            <span className="font-semibold text-[hsl(var(--brand-green))]">
              {actionCount} {actionCount === 1 ? "ação prioritária" : "ações prioritárias"}
            </span>{" "}
            neste momento.
          </p>
          <p className="text-sm text-[hsl(var(--console-fg))]/70 max-w-2xl">{recommendation}</p>
        </div>

        {onStart && (
          <button
            type="button"
            onClick={onStart}
            className="w-fit rounded-lg bg-[hsl(var(--brand-green))] px-4 py-2 text-sm font-semibold text-[hsl(var(--console-bg))] transition-colors hover:opacity-90"
          >
            Começar meu dia
          </button>
        )}
      </div>
    </section>
  );
}
