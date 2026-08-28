// P21 Intelligence Signal — Sprint 1.2 (correção 3).
// Substitui o "Intelligence Core" (esfera/partículas/órbitas — descartado
// por ficar sci-fi/radar demais). A inteligência agora é representada por
// PRESENÇA, não objeto: um ponto pequeno com pulso muito lento + status
// textual curto, nada mais. ~16-20px. Respeita prefers-reduced-motion.

interface P21SignalProps {
  label: string;
  className?: string;
}

export default function P21Signal({ label, className = "" }: P21SignalProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-pulse-green rounded-full bg-[hsl(var(--mission-accent))] motion-reduce:animate-none" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--mission-accent))]" />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--mission-text-faint))]">
        {label}
      </span>
    </div>
  );
}
