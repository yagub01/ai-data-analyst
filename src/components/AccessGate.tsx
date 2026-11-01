"use client";

import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { checkAccess, saveAccessCode } from "@/lib/accessClient";

export function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok } = await checkAccess(c);
      if (ok) {
        saveAccessCode(c);
        onUnlock();
      } else {
        setError("That code isn't right. Check it and try again.");
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 text-ink">
          <Lock size={20} className="text-accent" />
          <h1 className="text-xl font-semibold">AI Data Analyst</h1>
        </div>
        <p className="mt-2 text-sm text-ink-2">This app is private. Enter the access code you were given.</p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="Access code"
          aria-label="Access code"
          className="mt-4 w-full h-11 rounded-lg border border-line bg-page px-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="mt-4 w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white disabled:opacity-40"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Continue
        </button>
      </form>
    </main>
  );
}
