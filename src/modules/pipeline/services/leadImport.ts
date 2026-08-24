import type { ICPStars, Lead, PipelineStage } from "@/shared/services/store";

export type LeadImportFieldKey =
  | "company"
  | "contact"
  | "phone"
  | "website"
  | "niche"
  | "city"
  | "gmnLink"
  | "instagramLink"
  | "notes"
  | "googleRating"
  | "googleReviews"
  | "icpStars";

export interface LeadImportResult {
  leads: Lead[];
  created: number;
  updated: number;
}

function normalizePhone(value?: string) {
  return (value || "").replace(/\D+/g, "");
}

function normalizeText(value?: string) {
  return (value || "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeGmn(value?: string) {
  return normalizeText(value).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function companyCityKey(company?: string, city?: string) {
  const normalizedCompany = normalizeText(company);
  const normalizedCity = normalizeText(city);
  return normalizedCompany && normalizedCity ? `${normalizedCompany}|${normalizedCity}` : "";
}

function parseIcp(value: string): ICPStars {
  const parsed = Number.parseInt(value, 10);
  return Math.min(5, Math.max(1, Number.isFinite(parsed) ? parsed : 2)) as ICPStars;
}

export function importLeadsWithTag(
  existing: Lead[],
  rows: Record<string, string>[],
  mapping: Record<LeadImportFieldKey, string>,
  selectedTag: string,
  initialStage: PipelineStage,
): LeadImportResult {
  const leads = existing.map((lead) => ({ ...lead, tags: lead.tags ? [...lead.tags] : [] }));
  const byPhone = new Map<string, Lead>();
  const byCompanyCity = new Map<string, Lead>();
  const byGmn = new Map<string, Lead>();

  const indexLead = (lead: Lead) => {
    const phone = normalizePhone(lead.phoneNormalized || lead.phone);
    const companyCity = companyCityKey(lead.company, lead.city);
    const gmn = normalizeGmn(lead.gmnLink);
    if (phone) byPhone.set(phone, lead);
    if (companyCity) byCompanyCity.set(companyCity, lead);
    if (gmn) byGmn.set(gmn, lead);
  };

  leads.forEach(indexLead);
  const tag = selectedTag.trim().toUpperCase();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const get = (key: LeadImportFieldKey) => {
      const column = mapping[key];
      if (!column || column === "__none__") return "";
      return String(row[column] ?? "").trim();
    };

    const company = get("company");
    if (!company) continue;

    const phone = get("phone");
    const city = get("city");
    const gmnLink = get("gmnLink");
    const phoneKey = normalizePhone(phone);
    const companyCity = companyCityKey(company, city);
    const gmn = normalizeGmn(gmnLink);
    const match = (phoneKey && byPhone.get(phoneKey))
      || (gmn && byGmn.get(gmn))
      || (companyCity && byCompanyCity.get(companyCity));
    const importedIcp = parseIcp(get("icpStars"));

    if (match) {
      const index = leads.findIndex((lead) => lead.id === match.id);
      if (index < 0) continue;
      const current = leads[index];
      const notes = get("notes");
      const rating = Number.parseFloat(get("googleRating").replace(",", "."));
      const reviews = Number.parseInt(get("googleReviews").replace(/\D/g, ""), 10);
      const updatedLead: Lead = {
        ...current,
        company,
        contact: get("contact") || current.contact,
        phone: phone || current.phone,
        website: get("website") || current.website,
        niche: get("niche") || current.niche,
        city: city || current.city,
        gmnLink: gmnLink || current.gmnLink,
        instagramLink: get("instagramLink") || current.instagramLink,
        notes: notes ? (current.notes ? `${current.notes}\n${notes}` : notes) : current.notes,
        googleRating: Number.isFinite(rating) ? rating : current.googleRating,
        googleReviews: Number.isFinite(reviews) ? reviews : current.googleReviews,
        icpStars: mapping.icpStars && mapping.icpStars !== "__none__" ? importedIcp : current.icpStars,
        tags: Array.from(new Set([tag, ...(current.tags || [])].filter(Boolean))),
      };
      leads[index] = updatedLead;
      indexLead(updatedLead);
      updated++;
      continue;
    }

    const now = new Date().toISOString();
    const rating = Number.parseFloat(get("googleRating").replace(",", "."));
    const reviews = Number.parseInt(get("googleReviews").replace(/\D/g, ""), 10);
    const newLead: Lead = {
      id: crypto.randomUUID(),
      company,
      contact: get("contact"),
      phone,
      website: get("website"),
      niche: get("niche"),
      city,
      gmnLink,
      instagramLink: get("instagramLink"),
      notes: get("notes"),
      googleRating: Number.isFinite(rating) ? rating : undefined,
      googleReviews: Number.isFinite(reviews) ? reviews : undefined,
      icpStars: importedIcp,
      runsAds: false,
      tags: tag ? [tag] : [],
      stage: initialStage,
      createdAt: now,
      stageChangedAt: now,
      attachments: [],
      interactions: [],
      callNotes: [],
    };
    leads.push(newLead);
    indexLead(newLead);
    created++;
  }

  return { leads, created, updated };
}