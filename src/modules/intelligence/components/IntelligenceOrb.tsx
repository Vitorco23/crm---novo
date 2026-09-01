// Orbe de inteligência — decorativo, atrás da saudação do Comando.
// Retomada deliberada do "Intelligence Core" (esfera/wireframe/partículas)
// descartado no Sprint 1.2 por parecer sci-fi demais — pedido explícito do
// usuário (2026-09) referenciando um app estilo "Jarvis". Reaproveita as
// animações orb-breathe/orb-spin-slow do tailwind.config.ts, que já
// existiam prontas e nunca chegaram a ser usadas.
//
// 100% CSS/SVG estático — nenhuma chamada de IA, nenhum custo de token.
// Puramente decorativo: aria-hidden, para de animar em prefers-reduced-motion.

interface IntelligenceOrbProps {
  className?: string;
  size?: number;
}

const RINGS = [
  { cx: 100, cy: 100, rx: 90, ry: 24 },
  { cx: 100, cy: 62, rx: 72, ry: 15 },
  { cx: 100, cy: 138, rx: 72, ry: 15 },
  { cx: 100, cy: 32, rx: 42, ry: 8 },
  { cx: 100, cy: 168, rx: 42, ry: 8 },
];

const MERIDIANS = [
  "M100,10 C60,10 60,190 100,190",
  "M100,10 C140,10 140,190 100,190",
  "M100,10 C20,40 20,160 100,190",
  "M100,10 C180,40 180,160 100,190",
];

const NODES = [
  { cx: 100, cy: 10, r: 2 },
  { cx: 100, cy: 190, r: 2 },
  { cx: 28, cy: 100, r: 1.6 },
  { cx: 172, cy: 100, r: 1.6 },
  { cx: 60, cy: 62, r: 2.4 },
  { cx: 140, cy: 138, r: 2.4 },
  { cx: 150, cy: 55, r: 1.6 },
  { cx: 50, cy: 145, r: 1.6 },
];

const LINKS: [number, number][] = [
  [4, 6],
  [5, 7],
  [4, 2],
  [5, 3],
];

export default function IntelligenceOrb({ className = "", size = 260 }: IntelligenceOrbProps) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none motion-reduce:animate-none animate-orb-breathe ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full animate-orb-spin-slow motion-reduce:animate-none"
        style={{ transformOrigin: "50% 50%" }}
      >
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--mission-accent))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--mission-accent))" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={100} cy={100} r={95} fill="url(#orb-core)" />

        {RINGS.map((r, i) => (
          <ellipse
            key={i}
            cx={r.cx}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="hsl(var(--mission-accent))"
            strokeWidth={0.6}
            opacity={0.4}
          />
        ))}

        {MERIDIANS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="hsl(var(--mission-accent))" strokeWidth={0.5} opacity={0.3} />
        ))}

        {LINKS.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].cx}
            y1={NODES[a].cy}
            x2={NODES[b].cx}
            y2={NODES[b].cy}
            stroke="hsl(var(--mission-accent))"
            strokeWidth={0.4}
            opacity={0.35}
          />
        ))}

        {NODES.map((n, i) => (
          <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="hsl(var(--mission-accent))" opacity={0.75} />
        ))}
      </svg>
    </div>
  );
}
