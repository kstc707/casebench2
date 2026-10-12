import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildReviewRequest, costUsd, FALLBACK_BETA, MODEL, ReviewSchema, runReview, type Review, type ReviewInput } from "./review";

const input: ReviewInput = {
  task: { slug: "demo", title: "Zero weights", pr: 33127, file: "sklearn/utils/stats.py", testFile: "sklearn/utils/tests/test_stats.py" },
  diff: "--- a/sklearn/utils/stats.py\n+++ b/sklearn/utils/stats.py\n@@ -192,1 +192,1 @@\n-if a >= b:\n+if a > b:\n",
  prBody: "#### Reference Issues/PRs\nFixes #1\n",
  changelog: { path: "doc/whats_new/upcoming_changes/sklearn.utils/<PR number>.fix.rst", text: "- Fixed ``_weighted_percentile``.\n  By :user:`Me <me>`." },
  answers: [{ questionId: "why", prompt: "Why > ?", answer: "Because equal is valid.", points: [{ id: "equal-case", text: "The old check fired on equality." }] }],
  checks: [{ id: "tests", ok: true, title: "Tests pass", detail: "ok", rule: { file: "f", quote: "q" } }],
  rules: [{ id: "R1", file: "contributing/contributing.rst", startLine: 426, endLine: 427, heading: "Pull request checklist", text: "* You didn't modify unrelated lines." }],
};

const review: Review = {
  verdict: "needs work",
  reasons: ["The answer to 'why' misses a key point."],
  comments: [{ severity: "suggestion", where: "answers", line: null, comment: "Say what happens when next_index equals max_idx.", rule: null }],
  answers: [{ questionId: "why", covered: [], missed: ["equal-case"], followUp: "What value does next_index have in the failing example?" }],
};

describe("buildReviewRequest", () => {
  const req = buildReviewRequest(input);
  it("asks the current model for structured output at medium effort, with no sampling knobs and no prefill", () => {
    expect(req.model).toBe(MODEL);
    expect(req.max_tokens).toBe(16000);
    expect(req.output_config).toEqual({ effort: "medium" });
    expect(req).not.toHaveProperty("temperature");
    expect(req).not.toHaveProperty("top_p");
    expect(req).not.toHaveProperty("thinking");
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
  });
  it("includes the diff, PR text, changelog, checks, answers with key point ids, and the rule passages by id", () => {
    const text = req.messages[0].content;
    for (const part of ["+if a > b:", "Fixes #1", "By :user:`Me <me>`", "[ok] Tests pass", "[equal-case] The old check fired on equality.", "Because equal is valid.", "[R1] contributing/contributing.rst:426-427 (Pull request checklist)"]) {
      expect(text).toContain(part);
    }
    expect(req.system).toMatch(/Never write the fix/);
    expect(req.system).toMatch(/Never invent rules/);
  });
});

describe("costUsd", () => {
  it("prices input at $4 and output at $20 per million tokens", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
    expect(costUsd({ input_tokens: 5000, output_tokens: 2000 })).toBeCloseTo(0.06, 10);
  });
});

/**
 * The real SDK client, with fetch replaced: nothing leaves the machine, but the SDK's own request
 * building and structured-output parsing run for real.
 */
function sdkWith(...responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const client = new Anthropic({
    apiKey: "sk-ant-test",
    maxRetries: 0,
    fetch: (async (url: string, init: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      calls.push({ url: String(url), headers, body: JSON.parse(String(init.body)) });
      const r = responses[Math.min(calls.length - 1, responses.length - 1)];
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

const message = (stop_reason: string, text: string) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: MODEL,
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 5000, output_tokens: 2000 },
});
const errorBody = (type: string) => ({ type: "error", error: { type, message: `${type} (test)` } });

describe("runReview with the real SDK and a fake fetch", () => {
  it("sends one request to api.anthropic.com with the fallback beta and a JSON schema, and returns the parsed review", async () => {
    const { client, calls } = sdkWith({ status: 200, body: message("end_turn", JSON.stringify(review)) });
    const out = await runReview(client as never, buildReviewRequest(input));
    expect(out).toMatchObject({ ok: true, review, model: MODEL, usage: { input_tokens: 5000, output_tokens: 2000 }, fallbacks: "on" });
    expect(out.ok && out.costUsd).toBeCloseTo(0.06, 10);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(calls[0].headers["x-api-key"]).toBe("sk-ant-test");
    expect(calls[0].headers["anthropic-beta"]).toContain(FALLBACK_BETA);
    const body = calls[0].body as { fallbacks: string; output_config: { effort: string; format: { type: string; schema: unknown } }; model: string };
    expect(body.model).toBe(MODEL);
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(JSON.stringify(body.output_config.format.schema)).toContain("followUp");
    expect(body).not.toHaveProperty("thinking");
  });

  it("drops the fallback beta and retries once without it when the API answers 400", async () => {
    const { client, calls } = sdkWith({ status: 400, body: errorBody("invalid_request_error") }, { status: 200, body: message("end_turn", JSON.stringify(review)) });
    const out = await runReview(client as never, buildReviewRequest(input));
    expect(out).toMatchObject({ ok: true, fallbacks: "off" });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty("fallbacks");
    expect(calls[1].headers["anthropic-beta"] ?? "").not.toContain(FALLBACK_BETA);
  });

  it("says plainly when the model refused, or the answer was cut off, before reading any content", async () => {
    const refused = await runReview(sdkWith({ status: 200, body: message("refusal", "") }).client as never, buildReviewRequest(input));
    expect(refused).toMatchObject({ ok: false, kind: "refusal", message: "The model declined to review this request." });
    const cut = await runReview(sdkWith({ status: 200, body: message("max_tokens", '{"verdict": "rea') }).client as never, buildReviewRequest(input));
    expect(cut).toMatchObject({ ok: false, kind: "cut-off" });
  });

  it("refuses an answer that doesn't match the schema", async () => {
    const out = await runReview(sdkWith({ status: 200, body: message("end_turn", JSON.stringify({ verdict: "maybe" })) }).client as never, buildReviewRequest(input));
    expect(out.ok).toBe(false);
  });

  it.each([
    [401, "authentication_error", "auth", /This key was rejected/],
    [429, "rate_limit_error", "rate-limit", /Too many requests/],
    [500, "api_error", "api", /HTTP 500/],
  ])("HTTP %i → %s", async (status, type, kind, message) => {
    const out = await runReview(sdkWith({ status, body: errorBody(type) }).client as never, buildReviewRequest(input));
    expect(out).toMatchObject({ ok: false, kind });
    expect(!out.ok && out.message).toMatch(message);
  });

  it("a 400 on both tries is reported as a refused request", async () => {
    const out = await runReview(sdkWith({ status: 400, body: errorBody("invalid_request_error") }).client as never, buildReviewRequest(input));
    expect(out).toMatchObject({ ok: false, kind: "bad-request" });
  });

  it("a network failure is a connection error", async () => {
    const client = new Anthropic({ apiKey: "k", maxRetries: 0, fetch: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch });
    expect(await runReview(client as never, buildReviewRequest(input))).toMatchObject({ ok: false, kind: "connection" });
  });
});

describe("why runReview uses create, not parse", () => {
  it("the installed SDK's parse throws on a refusal's empty text, before stop_reason can be read", async () => {
    const { client } = sdkWith({ status: 200, body: message("refusal", "") });
    const req = buildReviewRequest(input);
    await expect(client.messages.parse({ ...req, output_config: { ...req.output_config, format: zodOutputFormat(ReviewSchema) } })).rejects.toThrow(/Failed to parse structured output/);
  });
});
