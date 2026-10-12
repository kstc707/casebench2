/**
 * The coach's optional AI review (stage 4), run in the browser with the student's own Anthropic API key.
 * One request reviews everything the student prepared: their diff against scikit-learn 1.8.0, the PR
 * text, the changelog fragment, their answers to the three questions, the automatic checks, and the
 * rule passages retrieval found (lib/coach/retrieval.ts). The answer comes back as structured JSON
 * (output_config.format with a JSON schema made from ReviewSchema by the SDK's zod helper).
 *
 * Why `messages.create` and not `messages.parse`: in the installed SDK (0.133.0), `parse` throws
 * "Failed to parse structured output" whenever the text isn't valid JSON for the schema, e.g. on a
 * refusal or an answer cut off at max_tokens, before stop_reason can be checked. So we create the
 * message, check stop_reason first, then validate the text with the same schema ourselves.
 *
 * Pure parts (the request, the outcome handling, the cost) are unit-tested with a mocked client
 * (review.test.ts). No test or CI job calls the real API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CheckResult } from "./checks";
import type { RulePassage } from "./retrieval";

export const MODEL = "claude-opus-5-5";
export const MAX_TOKENS = 16000;
/** USD per million tokens for MODEL, used for the cost estimate shown to the student. */
export const PRICE_PER_MTOK = { input: 4, output: 20 };
/** Server-side refusal fallbacks (beta). Dropped for the request if the API rejects it with a 400. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const ReviewSchema = z.object({
  verdict: z.enum(["ready", "needs work"]),
  reasons: z.array(z.string()),
  comments: z.array(
    z.object({
      severity: z.enum(["blocker", "suggestion", "nit"]),
      where: z.enum(["code", "pr description", "changelog", "answers"]),
      line: z.number().int().nullable(),
      comment: z.string(),
      rule: z.string().nullable(),
    })
  ),
  answers: z.array(
    z.object({
      questionId: z.string(),
      covered: z.array(z.string()),
      missed: z.array(z.string()),
      followUp: z.string(),
    })
  ),
});
export type Review = z.infer<typeof ReviewSchema>;

export interface ReviewInput {
  task: { slug: string; title: string; pr: number; file: string; testFile: string };
  /** The student's change, as a unified diff against the 1.8.0 file. */
  diff: string;
  prBody: string;
  changelog: { path: string; text: string };
  answers: Array<{ questionId: string; prompt: string; answer: string; points: Array<{ id: string; text: string }> }>;
  checks: CheckResult[];
  rules: RulePassage[];
}

export const SYSTEM_PROMPT = `You are an experienced scikit-learn maintainer reviewing a first-time contributor's pull request before they open it. They fixed a real, already-merged scikit-learn bug as practice, in their browser, and every required test passes.

Review it the way a careful maintainer would, and help them learn:
- Check the change follows scikit-learn's rules. Cite a rule only by the id of a passage given to you (R1, R2, ...), and only when that passage really supports the comment; otherwise set rule to null. Never invent rules.
- Check the pull request description follows scikit-learn's template, and the changelog fragment follows the fragment rules.
- scikit-learn requires contributors to understand and be able to explain every change. For each answer, list the ids of the key points the student actually explained in their own words (covered) and the ids they didn't (missed), and ask one short follow-up question that tests their understanding.
- Never write the fix, corrected code or a ready-to-paste PR description for them. Point at what to improve and why.
- Be concise and specific. Use "blocker" only for things a maintainer would not merge; "suggestion" for real improvements; "nit" for small style points.
- verdict is "ready" only when there are no blockers.`;

/** The request without the output format (added by runReview, which picks the API namespace). */
export function buildReviewRequest(input: ReviewInput) {
  const checks = input.checks.map((c) => `- [${c.ok ? "ok" : "not ok"}] ${c.title}: ${c.detail}`).join("\n");
  const rules = input.rules.map((r) => `[${r.id}] ${r.file}:${r.startLine}-${r.endLine}${r.heading ? ` (${r.heading})` : ""}\n${r.text}`).join("\n\n");
  const answers = input.answers
    .map(
      (a) =>
        `Question ${a.questionId}: ${a.prompt}\nKey points: ${a.points.map((p) => `[${p.id}] ${p.text}`).join(" ")}\nStudent's answer: ${a.answer.trim() || "(no answer)"}`
    )
    .join("\n\n");
  const text = [
    `Task: ${input.task.title} (scikit-learn PR #${input.task.pr}). The student edited ${input.task.file}; the tests are in ${input.task.testFile}.`,
    `<diff>\n${input.diff || "(no change)"}\n</diff>`,
    `<pull_request_description>\n${input.prBody}\n</pull_request_description>`,
    `<changelog_fragment path="${input.changelog.path}">\n${input.changelog.text}\n</changelog_fragment>`,
    `<automatic_checks>\n${checks}\n</automatic_checks>`,
    `<answers>\n${answers}\n</answers>`,
    `<scikit_learn_rules>\n${rules}\n</scikit_learn_rules>`,
  ].join("\n\n");
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: text }],
    output_config: { effort: "medium" as const },
  };
}
export type ReviewRequest = ReturnType<typeof buildReviewRequest>;

export function costUsd(usage: { input_tokens: number; output_tokens: number }): number {
  return (usage.input_tokens * PRICE_PER_MTOK.input + usage.output_tokens * PRICE_PER_MTOK.output) / 1_000_000;
}

export type ReviewOutcome =
  | {
      ok: true;
      review: Review;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      costUsd: number;
      latencyMs: number;
      fallbacks: "on" | "off";
    }
  | {
      ok: false;
      kind: "refusal" | "cut-off" | "invalid" | "auth" | "rate-limit" | "bad-request" | "connection" | "api" | "unknown";
      message: string;
      latencyMs: number;
      usage?: { input_tokens: number; output_tokens: number };
    };

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
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  try {
    const parsed = ReviewSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A browser client for the student's key. The key is sent only to the Anthropic API. */
export function browserClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** Sends the review request and turns every outcome into something the page can say plainly. */
export async function runReview(client: ReviewClient, request: ReviewRequest, now: () => number = () => Date.now()): Promise<ReviewOutcome> {
  const start = now();
  const elapsed = () => Math.round(now() - start);
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
      // The fallback beta isn't accepted with this request: send the same review without it.
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      fallbacks = "off";
      response = (await client.messages.create({
        ...request,
        output_config: { ...request.output_config, format: zodOutputFormat(ReviewSchema) },
      } as never)) as MessageLike;
    }
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal") {
      return { ok: false, kind: "refusal", message: "The model declined to review this request.", latencyMs: elapsed(), usage };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, kind: "cut-off", message: "The review was cut off before it finished (it hit the length limit).", latencyMs: elapsed(), usage };
    }
    const review = reviewFromMessage(response);
    if (review === null) {
      return { ok: false, kind: "invalid", message: "The review came back in an unexpected shape, so it can't be shown.", latencyMs: elapsed(), usage };
    }
    return { ok: true, review, model: response.model, usage, costUsd: costUsd(usage), latencyMs: elapsed(), fallbacks };
  } catch (err) {
    const latencyMs = elapsed();
    // Most specific first: APIConnectionError and the others are all APIErrors.
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, kind: "auth", message: "This key was rejected. Check it, or create a new one in the Anthropic Console.", latencyMs };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, kind: "rate-limit", message: "Too many requests, or this key's limit was reached. Wait a minute and try again.", latencyMs };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, kind: "bad-request", message: `The API refused the request: ${err.message}`, latencyMs };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, kind: "connection", message: "Couldn't reach api.anthropic.com. Check your connection and try again.", latencyMs };
    if (err instanceof Anthropic.APIError) return { ok: false, kind: "api", message: `The API returned an error${err.status ? ` (HTTP ${err.status})` : ""}. Try again later.`, latencyMs };
    return { ok: false, kind: "unknown", message: err instanceof Error ? err.message : String(err), latencyMs };
  }
}

/** One entry of the downloadable coach log: everything needed to evaluate the coach later. */
export interface CoachLogEntry {
  at: string;
  slug: string;
  model: string;
  request: ReviewRequest;
  /** The rule passages the request included, so comments can show the rule they cite. */
  rules: RulePassage[];
  outcome: ReviewOutcome;
  /** Per comment index: the student's rating. */
  ratings: Record<string, "up" | "down">;
}
