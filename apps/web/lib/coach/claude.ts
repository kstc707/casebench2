/**
 * The Claude adapter for the coach's AI review: the call with the student's own Anthropic API key, its
 * stop reasons and its errors. The request content, schema and checks are shared (lib/coach/review.ts).
 *
 * Why `messages.create` and not `messages.parse`: in the installed SDK (0.133.0), `parse` throws
 * "Failed to parse structured output" whenever the text isn't valid JSON for the schema, e.g. on a
 * refusal or an answer cut off at max_tokens, before stop_reason can be checked. So we create the
 * message, check stop_reason first, then validate the text with the same schema ourselves.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  buildReviewContent,
  MAX_TOKENS,
  randomNonce,
  reviewFromText,
  ReviewSchema,
  validateReview,
  type Review,
  type ReviewContext,
  type ReviewInput,
  type ReviewOutcome,
} from "./review";

export const CLAUDE_MODEL = "claude-opus-5-5";
/**
 * USD per million tokens, by the model that actually answered (a refusal fallback may answer with
 * another model). Used for the cost estimate; a model not listed shows "price unknown".
 */
export const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-4-8": { input: 5, output: 25 },
};
/** Server-side refusal fallbacks (beta). Dropped for the request if the API rejects it with a 400. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The Claude request without the output format (added by runClaudeReview, which picks the API namespace). */
export function buildClaudeRequest(input: ReviewInput, nonce: string = randomNonce()) {
  const { system, text } = buildReviewContent(input, nonce);
  return {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user" as const, content: text }],
    output_config: { effort: "medium" as const },
  };
}
export type ClaudeRequest = ReturnType<typeof buildClaudeRequest>;

/** The estimated cost in USD for the model that answered, or null when its price isn't known. */
export function costUsd(model: string, usage: { input_tokens: number; output_tokens: number }): number | null {
  const price = PRICES_PER_MTOK[model];
  if (!price) return null;
  return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
}

/** The part of the SDK client the review uses (lets tests pass a fake). */
export interface ReviewClient {
  messages: { create(params: never): Promise<unknown> };
  beta: { messages: { create(params: never): Promise<unknown> } };
}

interface MessageLike {
  stop_reason: string | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  content: Array<{ type: string; text?: string }>;
}

/** The review in a message's text blocks, validated against ReviewSchema; null if it isn't one. */
export function reviewFromMessage(message: Pick<MessageLike, "content">): Review | null {
  return reviewFromText(
    message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
  );
}

/** A browser client for the student's key. The key is sent only to the Anthropic API. */
export function claudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** The shape of an Anthropic API key, checked before any request. */
export const CLAUDE_KEY_FORMAT = /^sk-ant-[\w-]+$/;

/**
 * Whether a 400 is about the fallback beta (then the request is retried without it). This reads the
 * error's message, a deliberate exception to "never string-match errors" (the reviewer's choice): the
 * API has no error type for "this beta isn't available here", and retrying any other 400 only repeats it.
 */
function isFallbackRejection(err: InstanceType<typeof Anthropic.BadRequestError>): boolean {
  return /fallback|beta/i.test(err.message);
}

/** Sends the review request and turns every outcome into something the page can say plainly. */
export async function runClaudeReview(
  client: ReviewClient,
  request: ClaudeRequest,
  context: ReviewContext,
  now: () => number = () => Date.now()
): Promise<ReviewOutcome> {
  const start = now();
  const elapsed = () => Math.round(now() - start);
  let fallbackError: string | undefined;
  try {
    let fallbacks: "on" | "off" = "on";
    let response: MessageLike;
    try {
      response = (await client.beta.messages.create({
        ...request,
        output_config: { ...request.output_config, format: betaZodOutputFormat(ReviewSchema) },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      } as never)) as MessageLike;
    } catch (err) {
      // The fallback beta isn't accepted with this request: send the same review without it. Any other
      // 400 is reported as it is (retrying wouldn't help).
      if (!(err instanceof Anthropic.BadRequestError) || !isFallbackRejection(err)) throw err;
      fallbacks = "off";
      fallbackError = err.message;
      response = (await client.messages.create({
        ...request,
        output_config: { ...request.output_config, format: zodOutputFormat(ReviewSchema) },
      } as never)) as MessageLike;
    }
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    const billed = { provider: "claude" as const, model: response.model, usage, costUsd: costUsd(response.model, usage), fallbackError };
    if (response.stop_reason === "refusal") {
      return { ok: false, kind: "refusal", message: "The model declined to review this request.", latencyMs: elapsed(), ...billed };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, kind: "cut-off", message: "The review was cut off before it finished (it hit the length limit).", latencyMs: elapsed(), ...billed };
    }
    const review = reviewFromMessage(response);
    if (review === null) {
      return { ok: false, kind: "invalid", message: "The review came back in an unexpected shape, so it can't be shown.", latencyMs: elapsed(), ...billed };
    }
    return { ok: true, review, violations: validateReview(review, context), ...billed, latencyMs: elapsed(), fallbacks };
  } catch (err) {
    const latencyMs = elapsed();
    // Most specific first: APIConnectionError and the others are all APIErrors.
    const base = { ok: false as const, provider: "claude" as const, latencyMs, fallbackError };
    if (err instanceof Anthropic.AuthenticationError) return { ...base, kind: "auth", message: "This key was rejected. Check it, or create a new one in the Anthropic Console." };
    if (err instanceof Anthropic.RateLimitError) return { ...base, kind: "rate-limit", message: "Too many requests, or this key's limit was reached. Wait a minute and try again." };
    if (err instanceof Anthropic.BadRequestError) return { ...base, kind: "bad-request", message: `The API refused the request: ${err.message}` };
    if (err instanceof Anthropic.APIConnectionError) return { ...base, kind: "connection", message: "Couldn't reach api.anthropic.com. Check your connection and try again." };
    if (err instanceof Anthropic.APIError) return { ...base, kind: "api", message: `The API returned an error${err.status ? ` (HTTP ${err.status})` : ""}. Try again later.` };
    return { ...base, kind: "unknown", message: err instanceof Error ? err.message : String(err) };
  }
}

