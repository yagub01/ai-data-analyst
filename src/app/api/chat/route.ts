import type Anthropic from "@anthropic-ai/sdk";
import { DashboardUpdate, QueryInput, type DashboardSpecT } from "@/lib/schema";
import { chatTurn, toErrorResponse, zodTool } from "@/lib/claude";
import { CHAT_SYSTEM } from "@/lib/prompts";
import type { DatasetProfile } from "@/lib/types";

export const maxDuration = 300;

// The tools run in the browser, where the full dataset lives. This route makes
// one model call per request; the client executes any tool calls and sends
// the results back in the next request.
const TOOLS = [
  zodTool(
    "query_data",
    "Aggregate the full dataset. Returns one row per group with each metric, plus the row count. Filter values match case-insensitively.",
    QueryInput,
    { strict: true },
  ),
  zodTool(
    "update_dashboard",
    "Change the dashboard the user sees: add or replace charts and KPIs (same id replaces), remove them, or rename the dashboard. Include every field; use [] and null for parts you are not changing.",
    DashboardUpdate,
    { strict: false },
  ),
];

export async function POST(req: Request) {
  try {
    const { profile, spec, messages } = (await req.json()) as {
      profile: DatasetProfile;
      spec: DashboardSpecT;
      messages: Anthropic.Beta.BetaMessageParam[];
    };
    if (!profile || !spec || !messages?.length) {
      return Response.json({ error: "Missing chat context." }, { status: 400 });
    }

    const dashboard = {
      title: spec.title,
      timeColumn: spec.timeColumn,
      currency: spec.currency,
      kpis: spec.kpis.map((k) => ({ id: k.id, label: k.label })),
      charts: spec.charts.map((c) => ({ id: c.id, title: c.title, type: c.type, x: c.x, groupBy: c.groupBy })),
    };
    const system = `${CHAT_SYSTEM}\n\n<data_profile>\n${JSON.stringify(profile)}\n</data_profile>\n\n<understanding>\n${JSON.stringify(spec.understanding)}\n</understanding>\n\n<current_dashboard>\n${JSON.stringify(dashboard)}\n</current_dashboard>`;

    const response = await chatTurn({ system, messages, tools: TOOLS });
    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The AI declined to answer that." }, { status: 422 });
    }
    return Response.json({ content: response.content, stop_reason: response.stop_reason });
  } catch (err) {
    return toErrorResponse(err);
  }
}
