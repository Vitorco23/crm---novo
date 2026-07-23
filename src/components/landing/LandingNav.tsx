import { useLandingCta } from "./LandingShell";
import { Button } from "@/components/ui/button";

export function LandingNav() {
  const { openSoon } = useLandingCta();
  const links = [
    { label: "Metodologia", href: "#metodologia" },
    { label: "Casos", href: "#casos" },
    { label: "Sobre", href: "#sobre" },
  ];
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-[#0b1120]/80 border-b border-white/5">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <a href="#top" className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#9abd33]" />
          <span className="font-semibold tracking-tight">Performance<span className="text-[#9abd33]">21</span></span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          {links.map(l => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors">{l.label}</a>
          ))}
        </div>
        <Button
          onClick={() => openSoon("nav-diagnostico")}
          className="bg-[#9abd33] text-[#0b1120] hover:bg-[#88a82c] font-semibold"
          size="sm"
        >
          Diagnóstico gratuito
        </Button>
      </nav>
    </header>
  );
}
