import React, { useState, useEffect } from "react";

export function LPNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToHero = () => {
    document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        scrolled
          ? "bg-[#0b0b0d]/80 backdrop-blur-md border-[#2d2d2d] py-3"
          : "bg-transparent border-transparent py-5"
      }`}
    >
      <div className="max-w-[1180px] mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-[#caa55a] to-[#e2c589] flex items-center justify-center font-bold text-[#0b0b0d]">
            P
          </div>
          <span className="font-bold text-[#f5f5f5] text-lg tracking-tight">
            Performance21
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {["Método", "Serviços", "Cases", "Sobre", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
              className="text-sm font-medium text-[#b8b8b8] hover:text-[#caa55a] transition-colors"
            >
              {item}
            </a>
          ))}
        </div>


        <button
          onClick={scrollToHero}
          className="bg-gradient-to-r from-[#caa55a] to-[#e2c589] text-[#0b0b0d] px-5 py-2 rounded font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Solicitar Diagnóstico P21
        </button>
      </div>
    </nav>
  );
}
