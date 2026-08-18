import React, { lazy, Suspense } from "react";
import { LPNavbar } from "../components/LPNavbar";
import { LPHero } from "../components/LPHero";
import { LPSections } from "../components/LPSections";

const LP01 = () => {
  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#f5f5f5] selection:bg-[#caa55a]/30 selection:text-[#caa55a] font-sans">
      <LPNavbar />
      <main id="top">
        <LPHero />
        <LPSections />
      </main>
      
      <footer className="py-12 px-6 border-t border-[#2d2d2d] bg-[#0b0b0d]">
        <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <span className="text-sm font-medium tracking-wide">
              Performance<span className="text-[#caa55a]">21</span>
            </span>
          </div>
          
          <div className="text-[#b8b8b8] text-xs tracking-widest uppercase">
            © {new Date().getFullYear()} Performance21. Todos os direitos reservados.
          </div>
          
          <div className="flex gap-6">
            <a href="#" className="text-[#b8b8b8] hover:text-[#caa55a] transition-colors text-xs uppercase tracking-widest">Políticas</a>
            <a href="#" className="text-[#b8b8b8] hover:text-[#caa55a] transition-colors text-xs uppercase tracking-widest">Termos</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LP01;
