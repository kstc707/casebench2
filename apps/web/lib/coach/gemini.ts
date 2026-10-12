/**
 * The Gemini adapter for the coach's AI review (the default): the call with the student's own Google AI
 * Studio key on the free tier, the model list, finish reasons and errors. The request content, schema and
 * checks are shared with the Claude adapter (lib/coach/review.ts).
 *
 * Read from the installed @google/genai 2.28.0 (README and types), not checked against the live API:
 * - in the browser, `new GoogleGenAI({ apiKey })`; the key goes in the x-goog-api-key header to
 *   generativelanguage.googleapis.com;
 * - structured output: `config.responseMimeType: "application/json"` with `responseJsonSchema` (JSON
 *   Schema; only some keywords are supported, so we send a cleaned schema);
 * - `usageMetadata.promptTokenCount / candidatesTokenCount / thoughtsTokenCount`;
 * - `candidates[0].finishReason` (STOP, MAX_TOKENS, SAFETY, …) and `promptFeedback.blockReason`;
 * - errors: one class, ApiError, with `status` and a message that is the JSON error body.
 *
 * Free models get retired (a Casebench 1 lesson), so the page lists the student's available models and
 * picks the newest "flash" one; GEMINI_FALLBACK_MODEL is the only model name written here.
 */
import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse, type Model } from "@google/genai";
import { z } from "zod";
import {
  buildReviewContent,
  MAX_TOKENS,
  randomNonce,
  reviewFromText,
  ReviewSchema,
  validateReview,
  type ReviewContext,
  type ReviewInput,
  type ReviewOutcome,
} from "./review";

/** Used when the model list can't be read. The alias the SDK's own README uses; not verified as live. */
export const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";

/**
 * Google AI Studio keys usually start with "AIza" and are 39 characters, but that isn't documented in the
 * SDK, so the check is lenient: letters, digits, "-" and "_", at least 20 of them.
 */
export const GEMINI_KEY_FORMAT = /^[\w-]{20,}$/;

export function geminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey, httpOptions: { baseUrl: "https://generativelanguage.googleapis.com" } });
}

// ------------------------------------------------------------------------------------------------
// Models
// ------------------------------------------------------------------------------------------------

export interface GeminiModelChoice {
  /** The id to send, e.g. "gemini-2.5-flash" (without the "models/" prefix). */
  id: string;
  label: string;
}

/** Version numbers in a model id, for sorting newest first ("gemini-3.1-flash" → [3, 1]). */
function version(id: string): number[] {
  const m = /gemini-(\d+(?:\.\d+)*)/.exec(id);
  return m ? m[1].split(".").map(Number) : [];
}

/**
 * The models worth offering for a review: text "flash" and "flash-lite" models that support
 * generateContent (not image, audio, TTS, live, embedding or robotics variants). Sorted with the newest
 * full "flash" first, then lite models; "-latest" aliases and previews after the versioned ones.
 */
export function pickReviewModels(models: Model[]): GeminiModelChoice[] {
  const seen = new Set<string>();
  const out: Array<GeminiModelChoice & { lite: boolean; latest: boolean; preview: boolean; v: number[] }> = [];
  for (const m of models) {
    const id = (m.name ?? "").replace(/^models\//, "");
    if (!id || seen.has(id)) continue;
    if (!/flash/.test(id) || /image|audio|tts|live|embedding|robotics|omni|veo|lyria|banana/.test(id)) continue;
    if (!(m.supportedActions ?? []).includes("generateContent")) continue;
    seen.add(id);
    out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id, lite: /lite/.test(id), latest: /latest/.test(id), preview: /preview|exp/.test(id), v: version(id) });
  }
  out.sort((a, b) => {
    if (a.lite !== b.lite) return a.lite ? 1 : -1;
    if (a.latest !== b.latest) return a.latest ? 1 : -1;
    if (a.preview !== b.preview) return a.preview ? 1 : -1;
    for (let i = 0; i < Math.max(a.v.length, b.v.length); i++) {
      const d = (b.v[i] ?? 0) - (a.v[i] ?? 0);
      if (d) return d;
    }
    return a.id.localeCompare(b.id);
  });
  return out.map(({ id, label }) => ({ id, label }));
}

/** The models the student's key can use for a review (one page of up to 200 is plenty). */
export async function listReviewModels(client: Pick<GoogleGenAI, "models">): Promise<GeminiModelChoice[]> {
  const pager = await client.models.list({ config: { pageSize: 200 } });
  return pickReviewModels(pager.page);
}

// ------------------------------------------------------------------------------------------------
// The request
// ------------------------------------------------------------------------------------------------

/** JSON Schema keywords Gemini's responseJsonSchema accepts (from the SDK's docs for that field). */
export const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items", "prefixItems",
  "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required", "propertyOrdering",
]);

/** ReviewSchema as JSON Schema, keeping only keywords Gemini supports ("$schema" is dropped). */
export function reviewJsonSchema(): unknown {
  const strip = (node: unknown, inProperties = false): unknown => {
    if (Array.isArray(node)) return node.map((n) => strip(n));
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => inProperties || SUPPORTED_SCHEMA_KEYWORDS.has(k))
        .map(([k, v]) => [k, strip(v, k === "properties" || k === "$defs")])
    );
  };
  return strip(z.toJSONSchema(ReviewSchema));
}

export function buildGeminiRequest(model: string, input: ReviewInput, nonce: string = randomNonce()): GenerateContentParameters {
  const { system, text } = buildReviewContent(input, nonce);
  return {
    model,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: reviewJsonSchema(),
      maxOutputTokens: MAX_TOKENS,
    },
  };
}

// ------------------------------------------------------------------------------------------------
// The call and its outcomes
// ------------------------------------------------------------------------------------------------

/** finishReasons that mean the answer was withheld or stopped for policy reasons. */
const BLOCKED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION"]);

/** The JSON error body inside an ApiError's message (the SDK puts the response body there). */
interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: Array<{ reason?: string; "@type"?: string }> };
}
function errorBody(err: ApiError): GoogleErrorBody {
  try {
    return JSON.parse(err.message) as GoogleErrorBody;
  } catch {
    return {};
  }
}

/** Plain words for an error from the Gemini API (by its HTTP status and the structured status/reason fields). */
export function describeGeminiError(err: unknown): { kind: Extract<ReviewOutcome, { ok: false }>["kind"]; message: string } {
  if (err instanceof ApiError) {
    const body = errorBody(err).error ?? {};
    const reasons = (body.details ?? []).map((d) => d.reason);
    if (reasons.includes("API_KEY_INVALID") || body.status === "UNAUTHENTICATED" || err.status === 401 || err.status === 403) {
      return { kind: "auth", message: "This Google AI Studio key was rejected. Check it, or create a new one at aistudio.google.com." };
    }
    if (err.status === 429 || body.status === "RESOURCE_EXHAUSTED") {
      return {
        kind: "rate-limit",
        message: "The free tier's limit for this model was reached (requests per minute or per day). Wait a minute, try a lite model, or try again tomorrow.",
      };
    }
    if (err.status === 404) {
      return { kind: "bad-request", message: "This model isn't available to your key (it may have been retired). Pick another one from the list." };
    }
    if (err.status >= 400 && err.status < 500) {
      return { kind: "bad-request", message: `The Gemini API refused the request${body.message ? `: ${body.message}` : "."}` };
    }
    return { kind: "api", message: `The Gemini API returned an error (HTTP ${err.status}). Try again later.` };
  }
  if (err instanceof TypeError) return { kind: "connection", message: "Couldn't reach generativelanguage.googleapis.com. Check your connection and try again." };
  return { kind: "unknown", message: err instanceof Error ? err.message : String(err) };
}

/** Sends the review to Gemini and turns every outcome into something the page can say plainly. */
export async function runGeminiReview(
  client: Pick<GoogleGenAI, "models">,
  request: GenerateContentParameters,
  context: ReviewContext,
  now: () => number = () => Date.now()
): Promise<ReviewOutcome> {
  const start = now();
  const elapsed = () => Math.round(now() - start);
  try {
    const response: GenerateContentResponse = await client.models.generateContent(request);
    const meta = response.usageMetadata ?? {};
    // Thinking tokens are part of the output (they count toward the free tier's limits too).
    const usage = { input_tokens: meta.promptTokenCount ?? 0, output_tokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) };
    const billed = { provider: "gemini" as const, model: response.modelVersion ?? request.model, usage, costUsd: 0, freeTier: true };
    const blocked = response.promptFeedback?.blockReason;
    if (blocked) {
      return { ok: false, kind: "refusal", message: `Google blocked the request (${blocked}${response.promptFeedback?.blockReasonMessage ? `: ${response.promptFeedback.blockReasonMessage}` : ""}).`, latencyMs: elapsed(), ...billed };
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") {
      return { ok: false, kind: "cut-off", message: "The review was cut off before it finished (it hit the length limit).", latencyMs: elapsed(), ...billed };
    }
    if (finish && BLOCKED.has(finish)) {
      return { ok: false, kind: "refusal", message: `The model stopped for policy reasons (${finish}).`, latencyMs: elapsed(), ...billed };
    }
    const review = finish === "STOP" ? reviewFromText(response.text ?? "") : null;
    if (review === null) {
      return {
        ok: false,
        kind: "invalid",
        message: finish && finish !== "STOP" ? `The review stopped unexpectedly (${finish}).` : "The review came back in an unexpected shape, so it can't be shown.",
        latencyMs: elapsed(),
        ...billed,
      };
    }
    return { ok: true, review, violations: validateReview(review, context), latencyMs: elapsed(), ...billed };
  } catch (err) {
    return { ok: false, provider: "gemini", ...describeGeminiError(err), latencyMs: elapsed() };
  }
}
