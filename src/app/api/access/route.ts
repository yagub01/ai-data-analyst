import { accessRequired, codeMatches } from "@/lib/access";

// POST (never cached) so a changed ACCESS_CODE takes effect without a rebuild.
// Body: { code?: string }. Reply: whether a code is required and whether this one works.
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const required = accessRequired();
  const ok = !required || codeMatches(code);
  if (code && !ok) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 800));
  }
  return Response.json({ required, ok });
}
