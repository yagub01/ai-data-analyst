import type Anthropic from "@anthropic-ai/sdk";
import { DashboardUpdate, QueryInput, type DashboardSpecT, type DashboardUpdateT } from "./schema";
import type { Dataset, DatasetProfile } from "./types";
import { runQuery } from "./engine";

export type ChatMessage = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

const MAX_STEPS = 8;

/**
 * Runs one user turn: calls the model, executes any tool calls here in the
 * browser against the full dataset, and loops until the model answers.
 * `onUpdate` receives the growing transcript so the UI can show progress.
 */
export async function runChatTurn(opts: {
  history: ChatMessage[];
  userText: string;
  profile: DatasetProfile;
  /** Dashboard as it was when the conversation started (keeps the system prompt stable). */
  baseSpec: DashboardSpecT;
  ds: Dataset;
  timeColumn: string | null;
  applyUpdate: (u: DashboardUpdateT) => string;
  onUpdate: (messages: ChatMessage[]) => void;
}): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [...opts.history, { role: "user", content: opts.userText }];
  opts.onUpdate(messages);

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: opts.profile, spec: opts.baseSpec, messages }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Chat failed.");

    const content = body.content as ContentBlock[];
    // Append the full content (including thinking blocks) unchanged.
    messages.push({ role: "assistant", content: content as Anthropic.Beta.BetaContentBlockParam[] });
    opts.onUpdate([...messages]);
    if (body.stop_reason !== "tool_use") return messages;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => executeTool(b, opts));
    messages.push({ role: "user", content: results });
    opts.onUpdate([...messages]);
  }
  return messages;
}

function executeTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  opts: { ds: Dataset; timeColumn: string | null; applyUpdate: (u: DashboardUpdateT) => string },
): Anthropic.Beta.BetaToolResultBlockParam {
  const fail = (msg: string) => ({ type: "tool_result" as const, tool_use_id: block.id, content: msg, is_error: true });
  try {
    if (block.name === "query_data") {
      const q = QueryInput.safeParse(block.input);
      if (!q.success) return fail(`Invalid query: ${q.error.message}`);
      const out = runQuery(opts.ds, q.data, opts.timeColumn);
      return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) };
    }
    if (block.name === "update_dashboard") {
      const u = DashboardUpdate.safeParse(block.input);
      if (!u.success) return fail(`Invalid update: ${u.error.message}`);
      return { type: "tool_result", tool_use_id: block.id, content: opts.applyUpdate(u.data) };
    }
    return fail(`Unknown tool ${block.name}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Tool failed.");
  }
}

/** What the chat UI shows: user text, assistant text, and tool activity. */
export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; text: string };

export function toChatItems(messages: ChatMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") items.push({ kind: "user", text: m.content });
      continue; // tool results are not shown
    }
    if (typeof m.content === "string") {
      items.push({ kind: "assistant", text: m.content });
      continue;
    }
    for (const b of m.content ?? []) {
      if (b.type === "text" && b.text.trim()) items.push({ kind: "assistant", text: b.text });
      if (b.type === "tool_use") {
        items.push({ kind: "tool", text: b.name === "query_data" ? "Ran a query on your data" : "Updated the dashboard" });
      }
    }
  }
  return items;
}
