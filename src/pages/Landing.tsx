import { LandingShell } from "@/components/landing/LandingShell";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { Comparison } from "@/components/landing/Comparison";
import { Methodology } from "@/components/landing/Methodology";
import { NotForYou } from "@/components/landing/NotForYou";
import { Cases } from "@/components/landing/Cases";
import { About } from "@/components/landing/About";
import { FinalCta } from "@/components/landing/FinalCta";

export default function Landing() {
  return (
    <LandingShell>
      <LandingNav />
      <main>
        <Hero />
        <Comparison />
        <Methodology />
        <NotForYou />
        <Cases />
        <About />
        <FinalCta />
      </main>
    </LandingShell>
  );
}
