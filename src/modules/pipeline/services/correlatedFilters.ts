import { Lead } from "@/shared/services/store";

/**
 * Normaliza e agrupa leads por uma determinada chave (ex: city, niche, tags)
 * Útil para filtros dinâmicos e correlação.
 */
export function getAvailableOptions(leads: Lead[], field: keyof Lead) {
  const options = new Set<string>();
  leads.forEach(lead => {
    const val = lead[field];
    if (Array.isArray(val)) {
      val.forEach(v => v && options.add(v));
    } else if (typeof val === 'string' && val.trim()) {
      options.add(val.trim());
    }
  });
  return Array.from(options).sort();
}

/**
 * Retorna as opções filtradas baseadas em outros critérios selecionados.
 * Ex: Se selecionar Cidade X, retorna apenas Nichos que existem na Cidade X.
 */
export function getCorrelatedOptions(
  leads: Lead[],
  targetField: keyof Lead,
  filters: Partial<Record<keyof Lead, string[]>>
) {
  const filteredLeads = leads.filter(lead => {
    for (const [field, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      
      const leadVal = lead[field as keyof Lead];
      if (Array.isArray(leadVal)) {
        if (!leadVal.some(v => values.includes(v))) return false;
      } else if (typeof leadVal === 'string') {
        if (!values.includes(leadVal)) return false;
      } else {
        return false;
      }
    }
    return true;
  });

  return getAvailableOptions(filteredLeads, targetField);
}
