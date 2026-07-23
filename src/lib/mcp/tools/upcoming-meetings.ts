import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKey, requireAuth, text } from "../_helpers";

type Meeting = {
  id: string;
  leadId: string;
  company: string;
  date: string;
  time: string;
  title?: string;
  contactName?: string;
  source?: string;
  meetLink?: string;
  googleEventUrl?: string;
};

export default defineTool({
  name: "list_upcoming_meetings",
  title: "Próximas reuniões",
  description: "Lista reuniões agendadas nos próximos N dias (default 7), ordenadas cronologicamente.",
  inputSchema: {
    days: z.number().int().min(1).max(60).optional().describe("Janela em dias (default 7)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    requireAuth(ctx);
    const window = days ?? 7;
    const meetings = await loadKey<Meeting[]>(ctx, "p21_meetings", []);
    const now = new Date();
    const end = new Date(now.getTime() + window * 24 * 60 * 60 * 1000);
    const parsed = meetings
      .map((m) => ({ m, at: new Date(`${m.date}T${m.time || "00:00"}:00`) }))
      .filter(({ at }) => at >= now && at <= end)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(({ m, at }) => ({ ...m, when: at.toISOString() }));
    return text({ window_days: window, count: parsed.length, meetings: parsed }, { count: parsed.length });
  },
});
