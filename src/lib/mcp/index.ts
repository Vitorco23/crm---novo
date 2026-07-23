import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list-leads";
import getLead from "./tools/get-lead";
import createLead from "./tools/create-lead";
import upcomingMeetings from "./tools/upcoming-meetings";
import pipelineSummary from "./tools/pipeline-summary";
import logCall from "./tools/log-call";

// Direct Supabase host — not the .lovable.cloud proxy — required by mcp-js issuer check.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "performance21-mcp",
  title: "Performance21 CRM",
  version: "0.1.0",
  instructions:
    "Ferramentas do CRM Performance21. Permitem consultar leads, resumo do pipeline (Cold Call, Oportunidades, Onboarding), próximas reuniões, criar leads e registrar notas de ligações. Cada chamada roda como o usuário autenticado; dados são escopados por conta via RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, getLead, createLead, upcomingMeetings, pipelineSummary, logCall],
});
