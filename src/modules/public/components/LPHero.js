import React, { useState, useEffect } from "react";
import { getAvailability } from "../utils/availability";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
export function LPHero() {
    const [availability, setAvailability] = useState(30);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        name: "",
        company: "",
        whatsapp: ""
    });
    useEffect(() => {
        setAvailability(getAvailability());
    }, []);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading)
            return;
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke("receive-landing-lead", {
                body: {
                    ...formData,
                    source: "lp01",
                    url: window.location.href
                }
            });
            if (error)
                throw error;
            toast({
                title: "Solicitação enviada!",
                description: "Recebemos seus dados. Em breve entraremos em contato para o diagnóstico.",
            });
            setFormData({ name: "", company: "", whatsapp: "" });
        }
        catch (err) {
            console.error("Erro ao enviar lead:", err);
            toast({
                variant: "destructive",
                title: "Erro ao enviar",
                description: "Não foi possível enviar seus dados agora. Tente novamente em instantes.",
            });
        }
        finally {
            setLoading(false);
        }
    };
    return (<section id="hero" className="pt-32 pb-20 md:pt-48 md:pb-32 px-6">
      <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
        {/* Coluna Esquerda */}
        <div className="md:col-span-7 flex flex-col gap-6">
          <p className="text-[#caa55a] text-sm font-medium tracking-wide uppercase">
            Para empresas que já têm uma operação rodando e querem destravar o próximo nível de receita.
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-[#f5f5f5] leading-[1.1]">
            Sua empresa não precisa de mais marketing.{" "}
            <span className="bg-gradient-to-r from-[#caa55a] to-[#e2c589] bg-clip-text text-transparent">
              Ela precisa parar de perder receita.
            </span>
          </h1>
          <p className="text-[#b8b8b8] text-lg md:text-xl max-w-xl leading-relaxed">
            Estruturamos toda a jornada comercial da sua empresa para transformar marketing, vendas e operação em um único sistema previsível.
          </p>
          
          <div className="flex flex-col gap-3 mt-4">
            {[
            "Diagnóstico dos gargalos comerciais",
            "Atendimento, vendas e recorrência analisados em conjunto",
            "Foco em previsibilidade de receita"
        ].map((item) => (<div key={item} className="flex items-center gap-3 text-[#f5f5f5]">
                <CheckCircle2 className="w-5 h-5 text-[#caa55a] shrink-0"/>
                <span>{item}</span>
              </div>))}
          </div>
        </div>

        {/* Coluna Direita - Formulário */}
        <div className="md:col-span-5">
          <div className="bg-[#151517] border border-[#2d2d2d] rounded-2xl p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#caa55a] to-[#e2c589]"/>
            
            <h2 className="text-2xl font-bold text-[#f5f5f5] mb-2">Solicite seu Diagnóstico P21</h2>
            <p className="text-[#b8b8b8] text-sm mb-8 leading-relaxed">
              Comece deixando seus dados de contato. Na próxima etapa vamos entender melhor a sua operação.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider">Nome Completo</label>
                <input id="name" type="text" required placeholder="Seu nome" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-[#1c1c20] border border-[#2d2d2d] rounded-lg px-4 py-3 text-[#f5f5f5] focus:outline-none focus:border-[#caa55a] transition-colors"/>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="company" className="text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider">Empresa</label>
                <input id="company" type="text" required placeholder="Nome da sua empresa" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="bg-[#1c1c20] border border-[#2d2d2d] rounded-lg px-4 py-3 text-[#f5f5f5] focus:outline-none focus:border-[#caa55a] transition-colors"/>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="whatsapp" className="text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider">WhatsApp</label>
                <input id="whatsapp" type="tel" required placeholder="(00) 00000-0000" value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} className="bg-[#1c1c20] border border-[#2d2d2d] rounded-lg px-4 py-3 text-[#f5f5f5] focus:outline-none focus:border-[#caa55a] transition-colors"/>
              </div>

              <button type="submit" disabled={loading} className="mt-4 bg-[#caa55a] text-[#0b0b0d] py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? "ENVIANDO..." : "CONTINUAR DIAGNÓSTICO"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#2d2d2d] text-center">
              <p className="text-[#b8b8b8] text-[10px] uppercase tracking-widest font-medium">
                Disponibilidade atual: até {availability} diagnósticos para empresas da sua região neste período.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>);
}
