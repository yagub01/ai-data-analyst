"use client";

import { MessageSquare, Send, X, Database } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toChatItems, type ChatItem, type ChatMessage } from "@/lib/chatClient";
import { VoiceButton } from "./VoiceButton";

// Compact styles for the assistant's markdown (bold, lists, tables).
const MD: Components = {
  p: (p) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
  ul: (p) => <ul className="my-1.5 list-disc pl-5 space-y-0.5" {...p} />,
  ol: (p) => <ol className="my-1.5 list-decimal pl-5 space-y-0.5" {...p} />,
  strong: (p) => <strong className="font-semibold" {...p} />,
  table: (p) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs tabular" {...p} />
    </div>
  ),
  th: (p) => <th className="border-b border-line px-1.5 py-1 text-left font-medium text-ink-2" {...p} />,
  td: (p) => <td className="border-b border-line px-1.5 py-1" {...p} />,
  code: (p) => <code className="rounded bg-surface px-1 text-xs" {...p} />,
};

/** Collapses runs of identical tool steps ("Ran 6 queries on your data"). */
function groupToolSteps(items: ChatItem[]): ChatItem[] {
  const out: ChatItem[] = [];
  let run = 0;
  items.forEach((it, i) => {
    const next = items[i + 1];
    if (it.kind === "tool" && next?.kind === "tool" && next.text === it.text) {
      run++;
      return;
    }
    if (it.kind === "tool" && run > 0 && it.text.startsWith("Ran a query")) {
      out.push({ kind: "tool", text: `Ran ${run + 1} queries on your data` });
    } else if (it.kind === "tool" && run > 0) {
      out.push({ kind: "tool", text: `${it.text} (${run + 1}×)` });
    } else {
      out.push(it);
    }
    run = 0;
  });
  return out;
}

const SUGGESTIONS = [
  "What should I focus on this month?",
  "Which segment is underperforming and why?",
  "Add a chart comparing the top 5 by month",
];

export function ChatPanel({
  open,
  onClose,
  messages,
  busy,
  error,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const baseRef = useRef("");
  const endRef = useRef<HTMLDivElement>(null);
  const items = toChatItems(messages);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, busy]);

  function send(t = text) {
    const msg = t.trim();
    if (!msg || busy) return;
    onSend(msg);
    setText("");
  }

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-surface border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between px-4 h-14 border-b border-line">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageSquare size={18} className="text-accent" /> Ask about your data
        </h2>
        <button onClick={onClose} className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-2" aria-label="Close chat">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {items.length === 0 && (
          <div className="text-sm text-ink-2 space-y-3">
            <p>
              Ask a question, tell me about your goals, or ask for a different chart. You can type or press the mic and
              speak.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left rounded-lg border border-line px-3 py-2 hover:bg-surface-2 text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {groupToolSteps(items).map((it, i) =>
          it.kind === "tool" ? (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted">
              <Database size={12} /> {it.text}
            </div>
          ) : it.kind === "user" ? (
            <div key={i} className="ml-auto max-w-[90%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap bg-accent text-white">
              {it.text}
            </div>
          ) : (
            <div key={i} className="max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed bg-surface-2 text-ink">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                {it.text}
              </ReactMarkdown>
            </div>
          ),
        )}
        {busy && <div className="text-sm text-muted animate-pulse">Thinking…</div>}
        {error && <div className="text-sm text-bad">{error}</div>}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-line p-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ask anything about this data…"
          className="flex-1 resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <VoiceButton
          size="sm"
          onStart={() => (baseRef.current = text ? text.trimEnd() + " " : "")}
          onText={(t) => setText(baseRef.current + t)}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
