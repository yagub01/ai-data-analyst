import { DashboardSpec } from "@/lib/schema";
import { structuredCall, toErrorResponse } from "@/lib/claude";
import { UNDERSTAND_SYSTEM } from "@/lib/prompts";
import { denyWithoutAccess } from "@/lib/access";
import type { DatasetProfile } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = denyWithoutAccess(req);
  if (denied) return denied;
  try {
    const { profile, notes } = (await req.json()) as { profile: DatasetProfile; notes?: string };
    if (!profile?.columns?.length) return Response.json({ error: "No data profile provided." }, { status: 400 });

    const user = [
      `<data_profile>\n${JSON.stringify(profile)}\n</data_profile>`,
      notes?.trim()
        ? `<user_notes>\n${notes.trim().slice(0, 4000)}\n</user_notes>`
        : "The user gave no notes. Infer what they most likely need.",
    ].join("\n\n");

    const spec = await structuredCall({ system: UNDERSTAND_SYSTEM, user, schema: DashboardSpec, effort: "medium" });
    return Response.json({ spec });
  } catch (err) {
    return toErrorResponse(err);
  }
}
