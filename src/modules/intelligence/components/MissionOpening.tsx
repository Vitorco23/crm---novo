// Abertura Inteligente da Missão do Dia — Sprint 1.2 (correção 3).
// Presença, não personagem: sem núcleo/orb/partículas. A inteligência vem
// do P21 Signal (ponto + status derivado da missão real) e de luz ambiente
// no próprio fundo do hero — nunca um objeto separado. Copy curta, derivada
// só de dados já calculados pelo priorityEngine/missionPlanner/missionStore.

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveDisplayName, useProfile } from "@/shared/hooks/useProfile";
import P21Signal from "@/modules/intelligence/components/P21Signal";

interface MissionOpeningProps {
  actionCount: number;
  urgentCount: number;
  generatedAt: string;
  missionDone: number;
  missionTotal: number;
  onStart?: () => void;
}

function greetingWord(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function MissionOpening({
  actionCount,
  urgentCount,
  generatedAt,
  missionDone,
  missionTotal,
  onStart,
}: MissionOpeningProps) {
  const { user } = useAuth();
  const { profile } = useProfile();

  // Nunca usar o prefixo do e-mail como nome — só display_name/first_name do
  // perfil ou user_metadata.full_name já existente no Auth.
  const firstName = resolveDisplayName(profile, user);
  const greeting = `${greetingWord(new Date().getHours())}${firstName ? `, ${firstName}` : ""}.`;

  const analyzedAt = useMemo(() => {
    const d = new Date(generatedAt);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [generatedAt]);

  // Status derivado só do progresso real da missão — nenhum estado inventado.
  const statusLabel =
    missionTotal > 0 && missionDone >= missionTotal
      ? "Missão concluída"
      : missionDone > 0
        ? `Missão em andamento · ${missionDone}/${missionTotal}`
        : `Missão pronta${analyzedAt ? ` · ${analyzedAt}` : ""}`;

  const interpretation =
    actionCount === 0
      ? "Nenhuma prioridade crítica agora — você pode iniciar seu bloco de prospecção."
      : urgentCount > 0
        ? `Sua operação pede atenção aos retornos. ${actionCount === 1 ? "1 ação merece" : `${actionCount} ações merecem`} prioridade antes de voltar à prospecção.`
        : `${actionCount === 1 ? "1 ação identificada" : `${actionCount} ações identificadas`} para hoje — sem retorno crítico pendente.`;

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-5 py-5 md:px-7 md:py-6 animate-fade-in"
      style={{
        background:
          "radial-gradient(ellipse 90% 100% at 88% 0%, hsl(var(--mission-accent) / 0.08), transparent 55%), radial-gradient(ellipse 70% 80% at 100% 100%, hsl(var(--mission-blue-glow) / 0.06), transparent 60%)",
      }}
    >
      <div className="relative space-y-2.5 max-w-2xl">
        <P21Signal label={statusLabel} />

        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[hsl(var(--mission-text))] [text-wrap:balance]">
          {greeting}
        </h1>

        <p className="text-sm text-[hsl(var(--mission-text-muted))] leading-relaxed">{interpretation}</p>

        {onStart && (
          <button
            type="button"
            onClick={onStart}
            className="mt-0.5 w-fit rounded-lg bg-[hsl(var(--mission-accent))] px-4 py-1.5 text-sm font-medium text-[hsl(var(--mission-bg))] transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Começar missão
          </button>
        )}
      </div>
    </section>
  );
}
