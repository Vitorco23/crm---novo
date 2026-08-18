import React from "react";

export function LPSections() {
  return (
    <div className="flex flex-col">
      {/* O Diagnóstico */}
      <section id="diagnóstico" className="py-24 px-6 bg-[#0b0b0d]">
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

      {/* Cases */}
      <section id="cases" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto text-center mb-16">
          <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Cases</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-6">Resultados reais que se sustentam em receita.</h2>
          <p className="text-[#b8b8b8] text-lg max-w-2xl mx-auto">Empresas que substituíram esforço por sistema — e viram o crescimento se tornar previsível.</p>
        </div>
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              cat: "Energia Solar",
              headline: "R$ 186,80 investidos → R$ 14.200 em venda",
              situation: "Gerar oportunidades comercialmente viáveis sem depender apenas de indicação.",
              intervention: "Aquisição + processo comercial + acompanhamento das oportunidades.",
              results: ["Investimento em mídia: R$ 186,80", "Venda registrada: R$ 14.200,00"]
            },
            {
              cat: "Academia",
              headline: "AQUISIÇÃO → COMERCIAL → VENDA",
              situation: "Baixa conversão de leads e falta de visibilidade do funil comercial.",
              intervention: "Implementação de CRM + automação de follow-up + treinamento comercial.",
              results: ["Investimento em mídia: R$ 200,00", "Negociações vendidas: 46", "Receita registrada: R$ 9.328,80"]
            },
            {
              cat: "Açaíteria",
              headline: "ROAS 30,6 com +46% de crescimento semanal",
              results: ["Investimento em mídia: R$ 156,53", "ROAS atribuído: 30,6", "Valor de conversão: R$ 4.753,00", "Faturamento período: R$ 10.396,00"]
            },
            {
              cat: "Delivery",
              headline: "R$ 1,6 mil em mídia → R$ 36,9 mil em receita",
              results: ["Investimento total: R$ 1.603,02", "Compras realizadas: 377", "ROAS médio: 23,03", "Receita atribuída: R$ 36.922,59"]
            },
            {
              cat: "Pizzaria",
              headline: "R$ 896 em mídia → R$ 31,2 mil em receita atribuída",
              results: ["Investimento total: R$ 896,39", "Compras no site: 496", "Custo por compra: R$ 1,81", "ROAS médio: 34,83", "Valor de conversão: R$ 31.224,00"]
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-[#151517] border border-[#2d2d2d] p-10 rounded-2xl flex flex-col gap-6 hover:border-[#caa55a]/50 transition-colors">
              <span className="text-[#caa55a] text-xs font-bold uppercase tracking-widest">{item.cat}</span>
              <h3 className="text-xl font-bold text-[#f5f5f5] leading-snug">{item.headline}</h3>
              {item.situation && (
                <div>
                  <p className="text-[#f5f5f5] text-xs font-semibold mb-2 uppercase opacity-50">Situação</p>
                  <p className="text-[#b8b8b8] text-sm leading-relaxed">{item.situation}</p>
                </div>
              )}
              {item.intervention && (
                <div>
                  <p className="text-[#f5f5f5] text-xs font-semibold mb-2 uppercase opacity-50">Intervenção</p>
                  <p className="text-[#b8b8b8] text-sm leading-relaxed">{item.intervention}</p>
                </div>
              )}
              <div>
                <p className="text-[#f5f5f5] text-xs font-semibold mb-3 uppercase opacity-50">Resultados</p>
                <ul className="flex flex-col gap-2">
                  {item.results.map((r, i) => (
                    <li key={i} className="text-[#f5f5f5] text-sm font-medium flex items-center gap-2">
                      <span className="text-[#caa55a]">→</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <p className="max-w-[1180px] mx-auto text-center mt-12 text-[#b8b8b8] text-xs">*Resultados passados não garantem retornos futuros.</p>
      </section>

      {/* Serviços */}
      <section id="serviços" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
          <div className="lg:col-span-5">
            <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Escopo de Atuação</p>
            <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-8 leading-tight">
              NÃO vendemos um pacote pronto.<br />
              <span className="text-[#caa55a]">Encontramos o gargalo e estruturamos a solução.</span>
            </h2>
            <p className="text-[#b8b8b8] text-lg leading-relaxed">
              A Performance21 começa entendendo onde a operação perde receita. A partir desse diagnóstico, definimos quais frentes precisam ser estruturadas.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: "01", title: "Estratégia comercial", desc: "Diagnóstico e desenho do sistema de receita ponta a ponta." },
              { id: "02", title: "Engenharia Comercial", desc: "Estruturação de funil, playbooks e cadências de vendas." },
              { id: "03", title: "CRM e indicadores", desc: "Plataforma de gestão comercial e indicadores em tempo real." },
              { id: "04", title: "Automações", desc: "Fluxos que conectam marketing, vendas e operação sem fricção." },
              { id: "05", title: "Treinamento Comercial", desc: "Capacitação do time em método, discurso e execução." },
              { id: "06", title: "Estruturação de Processos", desc: "SLA, rituais e governança que sustentam a previsibilidade." },
              { id: "07", title: "Aquisição", desc: "Geração de demanda qualificada quando necessária para o projeto." },
              { id: "08", title: "Follow-up e recorrência", desc: "Processos para maximizar o LTV e reduzir churn." }
            ].map((item) => (
              <div key={item.id} className="bg-[#151517] border border-[#2d2d2d] p-6 rounded-xl group hover:border-[#caa55a]/30 transition-colors">
                <span className="text-[#caa55a] font-bold text-sm mb-3 block opacity-40">{item.id}</span>
                <h3 className="text-[#f5f5f5] font-bold mb-2 group-hover:text-[#caa55a] transition-colors">{item.title}</h3>
                <p className="text-[#b8b8b8] text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Método */}
      <section id="método" className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto text-center mb-16">
          <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">O Método</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-6">Os 5 Fundamentos da Engenharia de Receita.</h2>
          <p className="text-[#b8b8b8] text-lg max-w-3xl mx-auto leading-relaxed">
            Um framework que integra marketing, vendas e operação em um único sistema previsível de crescimento.
          </p>
        </div>
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-5 gap-6">
          {[
            { id: "01", title: "Assimilação", desc: "Clareza absoluta sobre posicionamento, oferta e público antes de qualquer investimento em mídia." },
            { id: "02", title: "Atração", desc: "Geração de demanda qualificada com canais orquestrados e mensagem consistente." },
            { id: "03", title: "Arguição", desc: "Processo comercial estruturado para qualificar, diagnosticar e conduzir cada oportunidade." },
            { id: "04", title: "Ação", desc: "Fechamento com método: proposta, negociação e conversão como etapas replicáveis." },
            { id: "05", title: "Apologia", desc: "Retenção, expansão e advocacia — transformando clientes em receita recorrente e reputação." }
          ].map((item) => (
            <div key={item.id} className="bg-[#151517] border border-[#2d2d2d] p-8 rounded-xl flex flex-col gap-4 text-center">
              <div className="w-12 h-12 rounded-full border border-[#caa55a]/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[#caa55a] font-bold">{item.id}</span>
              </div>
              <h3 className="text-lg font-bold text-[#f5f5f5]">{item.title}</h3>
              <p className="text-[#b8b8b8] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="max-w-[1180px] mx-auto mt-20 h-[400px] bg-[#151517] border border-[#2d2d2d] rounded-2xl flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0d] to-transparent opacity-60" />
          <p className="text-[#b8b8b8] text-sm uppercase tracking-widest font-medium z-10">[Espaço para Modelo Iceberg da Engenharia de Receita]</p>
        </div>
      </section>

      {/* Tecnologia */}
      <section className="py-24 px-6 bg-[#151517] border-y border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-[#caa55a] text-sm font-semibold tracking-widest uppercase mb-4">Tecnologia</p>
            <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] mb-8 leading-tight">A tecnologia sustenta o método.</h2>
            <p className="text-[#b8b8b8] text-lg leading-relaxed mb-8">
              O CRM Performance21 é a infraestrutura que garante a execução do processo comercial, permitindo o acompanhamento em tempo real de cada etapa da jornada.
            </p>
            <ul className="flex flex-col gap-4">
              {[
                "Gestão visual de pipeline por fundamentos",
                "Indicadores de conversão e produtividade",
                "Controle de atividades e cadências de follow-up",
                "Visibilidade total de gargalos na operação"
              ].map((bullet) => (
                <li key={bullet} className="flex items-center gap-4 text-[#f5f5f5] font-medium">
                  <div className="w-2 h-2 rounded-full bg-[#caa55a]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div className="h-[500px] bg-[#0b0b0d] border border-[#2d2d2d] rounded-3xl p-4 shadow-3xl overflow-hidden relative group">
             <div className="absolute inset-0 bg-gradient-to-br from-[#caa55a]/5 to-transparent opacity-50" />
             <div className="h-full w-full bg-[#1c1c20] rounded-2xl border border-[#2d2d2d] flex items-center justify-center">
                <p className="text-[#b8b8b8] text-sm uppercase tracking-widest font-medium">[Interface do CRM Performance21]</p>
             </div>
          </div>
        </div>
      </section>

      {/* Sobre */}
      <section id="sobre" className="py-24 px-6 bg-[#0b0b0d]">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-5 aspect-[4/5] bg-[#151517] rounded-3xl border border-[#2d2d2d] flex items-center justify-center overflow-hidden grayscale hover:grayscale-0 transition-all duration-500">
            <p className="text-[#b8b8b8] text-sm uppercase tracking-widest font-medium">[Foto Vítor Oliveira]</p>
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
            <h2 className="text-3xl md:text-4xl font-bold text-[#f5f5f5] mb-6">Perguntas Frequentes</h2>
            <p className="text-[#b8b8b8] leading-relaxed">
              Tudo o que você precisa saber sobre como trabalhamos para destravar o potencial de receita da sua empresa.
            </p>
          </div>
          <div className="lg:col-span-8 flex flex-col gap-4">
            {[
              { q: "O que é Engenharia de Receita?", a: "É a estruturação da jornada comercial para transformar marketing, vendas e operação em um único sistema previsível, focando em métricas de negócio e não apenas em cliques." },
              { q: "A Performance21 é uma agência de marketing?", a: "Não. Somos uma empresa de estruturação comercial. Enquanto agências focam em tráfego e leads, nós focamos no processo que transforma esses leads em receita real." },
              { q: "Vocês também trabalham aquisição/tráfego?", a: "Sim, como parte da estratégia. A aquisição é o combustível, mas só a ativamos quando o motor — processo comercial e CRM — está pronto para converter." },
              { q: "Para que tipo de empresa o trabalho faz sentido?", a: "Empresas com oferta validada, preferencialmente B2B ou serviços de alto valor, que buscam escala e previsibilidade comercial." },
              { q: "Como funciona o Diagnóstico P21?", a: "É uma análise técnica da sua operação atual para identificar gargalos, vazamentos de receita e oportunidades de melhoria prioritárias." },
              { q: "O diagnóstico tem custo?", a: "Atualmente, o diagnóstico inicial é gratuito e sem compromisso." },
              { q: "Quanto custa trabalhar com a Performance21?", a: "O investimento varia conforme o escopo e a complexidade da operação. Definimos isso após o diagnóstico estratégico." },
              { q: "Vocês implantam CRM?", a: "Sim, utilizamos nossa tecnologia proprietária ou auxiliamos na estruturação do CRM da operação." },
              { q: "Vocês treinam a equipe comercial?", a: "Sim. Estruturamos os playbooks e treinamos o time para garantir execução consistente." }
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
      <section className="py-24 px-6 bg-[#0b0b0d] border-t border-[#2d2d2d]">
        <div className="max-w-[1180px] mx-auto bg-gradient-to-br from-[#151517] to-[#1c1c20] border border-[#2d2d2d] rounded-[2.5rem] p-12 md:p-24 text-center flex flex-col items-center gap-8 relative overflow-hidden">
           <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#caa55a]/10 rounded-full blur-[100px]" />
           <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#caa55a]/10 rounded-full blur-[100px]" />
           
           <p className="text-[#caa55a] text-sm font-bold tracking-widest uppercase z-10">Próximo passo</p>
           <h2 className="text-3xl md:text-5xl font-bold text-[#f5f5f5] z-10 max-w-2xl leading-tight">
            Sua empresa está pronta para crescer com previsibilidade?
           </h2>
           <p className="text-[#b8b8b8] text-lg max-w-2xl z-10 leading-relaxed">
            Identifique os principais gargalos que podem estar limitando seu faturamento e quais pontos da operação merecem prioridade.
           </p>
           <div className="flex flex-col md:flex-row items-center gap-6 mt-4 z-10">
              <button 
                onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-gradient-to-r from-[#caa55a] to-[#e2c589] text-[#0b0b0d] px-10 py-5 rounded-xl font-bold text-xl hover:opacity-90 transition-opacity"
              >
                Solicitar Diagnóstico P21
              </button>
              <a href="#metodo" className="text-[#f5f5f5] font-bold underline underline-offset-8 hover:text-[#caa55a] transition-colors">
                Conhecer o Método
              </a>
           </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[#2d2d2d] bg-[#0b0b0d]">
        <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-[#b8b8b8] text-sm">
           <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#caa55a] flex items-center justify-center font-bold text-[#0b0b0d] text-xs">P</div>
              <span className="font-bold text-[#f5f5f5]">Performance21</span>
           </div>
           <p>© 2026 Performance21. Todos os direitos reservados.</p>
           <div className="flex items-center gap-8">
              <a href="#" className="hover:text-[#f5f5f5] transition-colors">Privacidade</a>
              <a href="#" className="hover:text-[#f5f5f5] transition-colors">Termos</a>
           </div>
        </div>
      </footer>
    </div>
  );
}
