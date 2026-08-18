import React from "react";
import icebergAssetImport from "@/assets/iceberg-engenharia-receita.png.asset.json";
import dashboardAssetImport from "@/assets/dashboard-hero.png.asset.json";
import vitorAssetImport from "@/assets/vitor.png.asset.json";
import caseEnergiaImport from "@/assets/solar-investimento.png.asset.json";
import caseAcademiaImport from "@/assets/academia-crm.jpg.asset.json";
import caseAcaiImport from "@/assets/acai-report.asset.json";
import { CheckCircle2 } from "lucide-react";

const icebergAsset = icebergAssetImport as any;
const dashboardAsset = dashboardAssetImport as any;
const vitorAsset = vitorAssetImport as any;
const caseEnergia = caseEnergiaImport as any;
const caseAcademia = caseAcademiaImport as any;
const caseAcai = caseAcaiImport as any;

export function LPSections() {
  const cases = [
    {
      cat: "Energia Solar",
      headline: "R$ 186,80 investidos → R$ 14.200 em venda",
      image: caseEnergia.url,
      results: ["Investimento em mídia: R$ 186,80", "Venda registrada: R$ 14.200,00"]
    },
    {
      cat: "Academia",
      headline: "AQUISIÇÃO → COMERCIAL → VENDA",
      image: caseAcademia.url,
      results: ["Investimento em mídia: R$ 200,00", "Negociações vendidas: 46", "Receita registrada: R$ 9.328,80"]
    },
    {
      cat: "Açaíteria",
      headline: "ROAS 30,6 com +46% de crescimento semanal",
      image: caseAcai.url,
      results: ["Investimento em mídia: R$ 156,53", "ROAS atribuído: 30,6", "Valor de conversão: R$ 4.753,00"]
    }
  ];

  return (
    <div className="flex flex-col">
      {/* O Diagnóstico */}
      <section id="diagnostico" className="py-24 px-6 bg-[#0b0b0d]">
        <div className="max-w-[1180px] mx-auto text-center mb-16">
          <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">O Diagnóstico</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-6">
            A maioria das empresas tenta vender mais quando deveria{" "}
            <span className="text-[#caa55a]">vender melhor.</span>
          </h2>
        </div>
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-5 gap-6">
          {[
            { id: "01", title: "Marketing sem processo", desc: "Campanhas e oportunidades entrando sem continuidade comercial estruturada." },
            { id: "02", title: "Equipe sem método", desc: "Cada pessoa atende, negocia e acompanha de um jeito." },
            { id: "03", title: "Follow-up inconsistente", desc: "Orçamentos, propostas e oportunidades ficam esquecidos." },
            { id: "04", title: "Receita imprevisível", desc: "Meses bons e ruins sem entendimento claro do porquê." },
            { id: "05", title: "Dependência do proprietário", desc: "O comercial perde desempenho quando o dono sai da operação." }
          ].map((item) => (
            <div key={item.id} className="bg-[#151517] border border-[#2d2d2d] p-8 rounded-xl flex flex-col gap-4">
              <span className="text-[#caa55a] font-bold text-2xl opacity-40">{item.id}</span>
              <h3 className="text-lg font-bold text-[#f5f5f5]">{item.title}</h3>
              <p className="text-[#b8b8b8] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Método com Iceberg */}
      <section id="metodo" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto text-center mb-16">
          <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">O Método</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-6">Engenharia de Receita.</h2>
          <p className="text-[#b8b8b8] text-lg max-w-3xl mx-auto leading-relaxed">
            O que você vê (o topo do iceberg) é apenas o tráfego. O que sustenta o crescimento é a estrutura submersa.
          </p>
        </div>
        <div className="max-w-[1000px] mx-auto relative group">
          <img 
            src={icebergAsset.url} 
            alt="Modelo Iceberg da Engenharia de Receita" 
            className="w-full h-auto rounded-3xl border border-[#caa55a]/20 shadow-2xl shadow-[#caa55a]/5 transition-transform duration-500 group-hover:scale-[1.01]"
            loading="lazy"
          />
        </div>
      </section>

      {/* Cases com Imagens */}
      <section id="cases" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto text-center mb-16">
          <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Cases</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-6">Resultados reais.</h2>
        </div>
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {cases.map((item, idx) => (
            <div key={idx} className="bg-[#151517] border border-[#2d2d2d] rounded-2xl overflow-hidden hover:border-[#caa55a]/50 transition-colors group">
              <div className="aspect-video overflow-hidden">
                <img 
                  src={item.image} 
                  alt={item.cat} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  loading="lazy"
                />
              </div>
              <div className="p-8 flex flex-col gap-4">
                <span className="text-[#caa55a] text-xs font-bold uppercase tracking-widest">{item.cat}</span>
                <h3 className="text-xl font-bold text-[#f5f5f5] leading-snug">{item.headline}</h3>
                <ul className="flex flex-col gap-2 mt-2">
                  {item.results.map((r, i) => (
                    <li key={i} className="text-[#b8b8b8] text-sm flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#caa55a] mt-0.5 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tecnologia com Interface CRM */}
      <section className="py-24 px-6 bg-[#151517] border-y border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Tecnologia</p>
            <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-8 leading-tight">A tecnologia sustenta o método.</h2>
            <p className="text-[#b8b8b8] text-lg leading-relaxed mb-8">
              O CRM Performance21 é a infraestrutura que garante a execução do processo comercial em tempo real.
            </p>
            <ul className="flex flex-col gap-4">
              {[
                "Gestão visual de pipeline por fundamentos",
                "Indicadores de conversão e produtividade",
                "Controle de atividades e cadências",
                "Visibilidade total de gargalos"
              ].map((bullet) => (
                <li key={bullet} className="flex items-center gap-4 text-[#f5f5f5] font-medium">
                  <CheckCircle2 className="w-5 h-5 text-[#caa55a]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-[#2d2d2d] shadow-3xl overflow-hidden relative group">
             <img 
               src={dashboardAsset.url} 
               alt="Interface CRM Performance21" 
               className="w-full h-auto grayscale group-hover:grayscale-0 transition-all duration-700"
               loading="lazy"
             />
          </div>
        </div>
      </section>

      {/* Sobre com Foto do Vítor */}
      <section id="sobre" className="py-24 px-6 bg-[#0b0b0d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-5 rounded-3xl border border-[#2d2d2d] overflow-hidden grayscale hover:grayscale-0 transition-all duration-500 shadow-2xl">
            <img 
              src={vitorAsset.url} 
              alt="Vítor Oliveira" 
              className="w-full h-auto scale-105"
              loading="lazy"
            />
          </div>
          <div className="lg:col-span-7">
            <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Sobre</p>
            <h2 className="text-4xl md:text-6xl font-bold text-[#f5f5f5] mb-8">Vítor Oliveira</h2>
            <p className="text-[#caa55a] text-xl font-medium mb-8 leading-relaxed">
              Fundador da Performance21 e Especialista em Engenharia de Receita e estruturação comercial.
            </p>
            <p className="text-[#b8b8b8] text-lg leading-relaxed mb-10">
              Lidera projetos de reestruturação comercial combinando método, tecnologia e execução — transformando operações artesanais em sistemas previsíveis de receita.
            </p>
            <div className="inline-flex flex-col border-l-2 border-[#caa55a] pl-6">
              <span className="text-4xl font-bold text-[#f5f5f5] mb-1">+20</span>
              <span className="text-[#b8b8b8] uppercase tracking-widest text-xs font-bold">Projetos realizados</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-4">
            <h2 className="text-3xl md:text-4xl font-bold text-[#f5f5f5] mb-6">FAQ</h2>
            <p className="text-[#b8b8b8] leading-relaxed">
              Tudo o que você precisa saber sobre a nossa metodologia.
            </p>
          </div>
          <div className="lg:col-span-8 flex flex-col gap-4">
            {[
              { q: "O que é Engenharia de Receita?", a: "É a estruturação da jornada comercial para transformar marketing, vendas e operação em um único sistema previsível." },
              { q: "A Performance21 é uma agência?", a: "Não. Somos uma empresa de estruturação comercial focada em receita real, não apenas cliques." },
              { q: "Para quem é o Diagnóstico?", a: "Empresas B2B ou serviços de alto valor que buscam previsibilidade e escala comercial." }
            ].map((faq, idx) => (
              <details key={idx} className="group bg-[#151517] border border-[#2d2d2d] rounded-2xl overflow-hidden">
                <summary className="p-8 font-bold text-[#f5f5f5] cursor-pointer flex justify-between items-center list-none hover:text-[#caa55a] transition-colors">
                  {faq.q}
                  <span className="text-[#caa55a] transform group-open:rotate-180 transition-transform duration-300">↓</span>
                </summary>
                <div className="px-8 pb-8 text-[#b8b8b8] text-sm leading-relaxed border-t border-[#2d2d2d]/30 pt-4">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d] mb-20">
        <div className="max-w-[1180px] mx-auto bg-gradient-to-br from-[#151517] to-[#1c1c20] border border-[#2d2d2d] rounded-[2.5rem] p-12 md:p-24 text-center flex flex-col items-center gap-8 relative overflow-hidden">
           <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#caa55a]/10 rounded-full blur-[100px]" />
           <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#caa55a]/10 rounded-full blur-[100px]" />
           
           <p className="text-[#caa55a] text-sm font-bold tracking-widest uppercase z-10">Próximo passo</p>
           <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] z-10 max-w-2xl leading-tight">
            Sua empresa está pronta para crescer com previsibilidade?
           </h2>
           <button 
             onClick={() => document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" })}
             className="z-10 bg-[#caa55a] text-[#0b0b0d] px-10 py-5 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-[#caa55a]/20"
           >
             Solicitar Diagnóstico P21
           </button>
        </div>
      </section>
    </div>
  );
}
