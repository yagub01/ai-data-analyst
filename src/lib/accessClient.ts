// Browser side of the access code: remembers the code the user entered and
// sends it with every AI request. The server is what actually enforces it.

const STORAGE_KEY = "ai-data-analyst:access-code";
const HEADER = "x-access-code";
export const ACCESS_DENIED_EVENT = "ai-data-analyst:access-denied";

// Fallback for browsers where localStorage is unavailable.
let memoryCode = "";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAccessCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private mode: the code then lasts only until the page reloads.
  }
  memoryCode = code;
}

export function accessHeaders(): Record<string, string> {
  const code = memoryCode || getAccessCode();
  return code ? { [HEADER]: code } : {};
}

/** Asks the server whether a code is needed and whether `code` is correct. */
export async function checkAccess(code: string): Promise<{ required: boolean; ok: boolean }> {
  const res = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { required: false, ok: true };
  return res.json();
}

/** Call on a 401 from an AI route: forgets the code and brings back the code screen. */
export function reportAccessDenied() {
  memoryCode = "";
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(ACCESS_DENIED_EVENT));
}
