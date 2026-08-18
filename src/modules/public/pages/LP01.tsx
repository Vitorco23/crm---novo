import React, { Suspense } from "react";
import { LPNavbar } from "../components/LPNavbar";
import { LPHero } from "../components/LPHero";
import { LPSections } from "../components/LPSections";

const LP01 = () => {
  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#f5f5f5] selection:bg-[#caa55a]/30 selection:text-[#f5f5f5] overflow-x-hidden">
      <LPNavbar />
      <main>
        <LPHero />
        <LPSections />
      </main>
    </div>
  );
};

export default LP01;
