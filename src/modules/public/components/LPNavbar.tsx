import React, { useState, useEffect } from "react";
import logoAsset from "@/assets/logo-p21.png.asset.json";

export function LPNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { href: "#metodo", label: "Método" },
    { href: "#servicos", label: "Serviços" },
    { href: "#cases", label: "Cases" },
    { href: "#sobre", label: "Sobre" },
    { href: "#faq", label: "FAQ" },
  ];

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace("#", "");
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <header 
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled 
          ? "bg-[#0b0b0d]/70 backdrop-blur-xl border-[#2d2d2d]" 
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="max-w-[1180px] mx-auto flex h-20 items-center justify-between px-6">
        <a href="#top" onClick={(e) => scrollToSection(e, "#top")} className="flex items-center gap-2">
          <img 
            src={logoAsset.url} 
            alt="Performance21 Logo" 
            className="h-8 w-auto rounded-lg brightness-125"
          />
          <span className="hidden text-sm font-medium tracking-wide text-[#f5f5f5] sm:block">
            Performance<span className="text-[#caa55a]">21</span>
          </span>
        </a>

        <nav className="flex items-center gap-4 sm:gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => scrollToSection(e, l.href)}
              className="text-[10px] sm:text-xs uppercase tracking-[0.14em] text-[#b8b8b8] transition-colors hover:text-[#f5f5f5]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="hidden items-center gap-2 rounded-full border border-[#caa55a]/40 px-6 py-2.5 text-[10px] sm:text-xs uppercase tracking-[0.14em] text-[#caa55a] transition-all hover:bg-[#caa55a] hover:text-[#0b0b0d] lg:inline-flex"
        >
          Solicitar Diagnóstico P21
          <span aria-hidden>→</span>
        </a>
      </div>
    </header>
  );
}
