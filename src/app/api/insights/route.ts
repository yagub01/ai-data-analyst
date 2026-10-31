import { InsightReport, type DashboardSpecT } from "@/lib/schema";
import { structuredCall, toErrorResponse } from "@/lib/claude";
import { INSIGHTS_SYSTEM } from "@/lib/prompts";
import type { Facts } from "@/lib/facts";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { spec, facts, notes } = (await req.json()) as { spec: DashboardSpecT; facts: Facts; notes?: string };
    if (!spec || !facts) return Response.json({ error: "Missing dashboard or facts." }, { status: 400 });

    const dashboard = {
      title: spec.title,
      understanding: spec.understanding,
      kpis: spec.kpis.map((k) => k.label),
      charts: spec.charts.map((c) => ({ id: c.id, title: c.title, why: c.why })),
    };
    const user = [
      `<dashboard>\n${JSON.stringify(dashboard)}\n</dashboard>`,
      `<facts>\n${JSON.stringify(facts)}\n</facts>`,
      notes?.trim() ? `<user_notes>\n${notes.trim().slice(0, 4000)}\n</user_notes>` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const report = await structuredCall({ system: INSIGHTS_SYSTEM, user, schema: InsightReport, effort: "medium" });
    return Response.json({ report });
  } catch (err) {
    return toErrorResponse(err);
  }
}
