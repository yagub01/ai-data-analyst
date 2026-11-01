import { createHash, timingSafeEqual } from "node:crypto";

// Server-only. When ACCESS_CODE is set (e.g. on a public deployment), every
// AI route requires the x-access-code header to match it, so strangers with
// the link cannot spend the API key. Unset, the app is open (local dev).

export const ACCESS_HEADER = "x-access-code";

export function accessRequired(): boolean {
  return !!process.env.ACCESS_CODE;
}

export function codeMatches(code: string | null | undefined): boolean {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  if (!code) return false;
  // Compare fixed-length hashes so timing reveals nothing about the code.
  const a = createHash("sha256").update(code).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Returns a 401 response when the request lacks a valid code, otherwise null. */
export function denyWithoutAccess(req: Request): Response | null {
  if (codeMatches(req.headers.get(ACCESS_HEADER))) return null;
  return Response.json({ error: "Access code required.", accessDenied: true }, { status: 401 });
}
