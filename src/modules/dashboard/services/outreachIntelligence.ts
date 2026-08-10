import { useMemo } from "react";
import { getLeads, type Lead, type Interaction } from "@/shared/services/store";

export interface OutreachStage {
  key: string;
  label: string;
  count: number;
  rate: number | null;
  leads: Lead[];
}

/**
 * Calcula o funil de outreach estruturado a partir da classificação estruturada das interações.
 * Projeto Phoenix 3B.
 */
export function useOutreachIntelligence(filterLeads: Lead[]) {
  return useMemo(() => {
    // 1. Ligações (Total de leads com ao menos uma interação de tipo Ligação ou nota de ligação)
    const leadsWithCalls = filterLeads.filter(l => 
      (l.interactions || []).some(i => /ligação|ligacao|call/i.test(i.type)) || 
      (l.callNotes || []).length > 0
    );

    // Helper para extrair a classificação estruturada mais recente de um lead
    const getLatestClassification = (l: Lead) => {
      const classified = (l.interactions || [])
        .filter(i => i.classification)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return classified?.classification;
    };

    // 2. Conexões (Atendeu a ligação)
    const connections = leadsWithCalls.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.connected;
      // Fallback heurístico para leads antigos
      return (l.interactions || []).length > 0;
    });

    // 3. Gatekeeper (Contato com filtro)
    const gatekeepers = connections.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.gatekeeper_contact;
      return /gatekeeper|secretária|secretaria/i.test((l.notes || "") + (l.autoDiagnosis?.attention || ""));
    });

    // 4. Decisor Identificado
    const dmIdentified = connections.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.decision_maker_identified;
      return /decisor/i.test((l.notes || "") + (l.autoDiagnosis?.attention || ""));
    });

    // 5. Acesso ao Decisor (Contato obtido ou encaminhamento prometido)
    const dmAccess = connections.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.decision_maker_contact_obtained || c.message_forwarding_promised;
      return false;
    });

    // 6. Decisor Contatado (Conseguiu falar com ele)
    const dmContacted = connections.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.decision_maker_contacted;
      return false;
    });

    // 7. Reunião Marcada
    const meetings = connections.filter(l => {
      const c = getLatestClassification(l);
      if (c) return c.access_status === "REUNIAO_MARCADA";
      return /reunião marcada|reuniao marcada/i.test(l.stage);
    });

    const buildStage = (key: string, label: string, list: Lead[], prevList?: Lead[]): OutreachStage => {
      const prevCount = prevList ? prevList.length : 0;
      return {
        key,
        label,
        count: list.length,
        rate: prevCount > 0 ? Math.round((list.length / prevCount) * 100) : null,
        leads: list
      };
    };

    const stages: OutreachStage[] = [
      buildStage("calls", "Ligações", leadsWithCalls),
      buildStage("connections", "Conexões", connections, leadsWithCalls),
      buildStage("gatekeepers", "Gatekeepers", gatekeepers, connections),
      buildStage("dm_identified", "Decisores Identificados", dmIdentified, connections),
      buildStage("dm_access", "Acesso ao Decisor", dmAccess, dmIdentified),
      buildStage("dm_contacted", "Decisor Contatado", dmContacted, dmAccess),
      buildStage("meetings", "Reuniões Marcadas", meetings, dmContacted)
    ];

    return { stages, totalLeads: filterLeads.length };
  }, [filterLeads]);
}
