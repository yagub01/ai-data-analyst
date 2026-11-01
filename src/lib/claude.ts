import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// Server-only: imported by the API routes, never by client components.

export const MODEL = process.env.AI_DATA_ANALYST_MODEL ?? "claude-opus-5-5";

// On a policy decline the API re-runs the request on a suitable fallback model.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export class UserFacingError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  const env = process.env;
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_PROFILE) {
    throw new UserFacingError(
      "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local (see .env.example) and restart the server.",
    );
  }
  client ??= new Anthropic();
  return client;
}

/** One structured-output call: returns data validated against `schema`. */
export async function structuredCall<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  effort: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  if (response.stop_reason === "refusal") {
    throw new UserFacingError("The AI declined to analyze this data.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new UserFacingError("The AI response was incomplete. Please try again.", 502);
  }
  return response.parsed_output as z.infer<S>;
}

export async function chatTurn(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}): Promise<Anthropic.Beta.BetaMessage> {
  return getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    system: opts.system,
    tools: opts.tools,
    messages: opts.messages,
  });
}

/**
 * A tool whose input schema comes from a zod object. Strict mode guarantees
 * schema-valid input but the API rejects large schemas under it, so big tools
 * go non-strict; the browser validates their input with zod either way.
 */
export function zodTool(
  name: string,
  description: string,
  schema: z.ZodType,
  { strict }: { strict: boolean },
): Anthropic.Beta.BetaTool {
  return {
    name,
    description,
    strict,
    input_schema: betaZodOutputFormat(schema).schema as Anthropic.Beta.BetaTool["input_schema"],
  };
}

/** Maps SDK errors to messages a user can act on. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof UserFacingError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json(
      { error: "The Anthropic API key is missing or invalid. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 401 },
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Rate limited by the AI provider. Wait a moment and retry." }, { status: 429 });
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("Anthropic bad request:", err.message);
    return Response.json({ error: `The AI request was rejected: ${err.message}` }, { status: 400 });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error:", err.status, err.message);
    return Response.json({ error: "The AI service had a problem. Please retry." }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}
