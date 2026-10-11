/**
 * What `pnpm team:ask` prints. Pure: takes a search response, returns text.
 *
 * Honesty lives in the wording (see .claude/team/decisions.md): results are
 * "closest passages" to check, never an answer, and a question whose words our
 * notes don't use gets a warning that the passages may be unrelated. Output
 * shows the passages' own text, so every excerpt can be found at its
 * file:line, and never the stemmed search terms.
 */
import { MEMORY_DIRS, type Passage } from "./corpus";
import { MAX_QUERY_CHARS, tokenize, type SearchResponse } from "./search";

/** Excerpts show at most this many lines of a passage… */
export const EXCERPT_LINES = 3;
/** …each cut to about this many characters. */
export const EXCERPT_LINE_CHARS = 120;
/** When a long line is cut around a matched word, keep this many characters before it. */
const CONTEXT_BEFORE = 30;

export interface FormatMeta {
  question: string;
  /** How many passages were searched. */
  passageCount: number;
}

/** One line of an excerpt: its real line number in the file, and its (possibly cut) text. */
export interface ExcerptLine {
  line: number;
  text: string;
}

const ELLIPSIS = "…";
// A word as search.ts reads it (see CHUNK there), to find where a matched term sits in a line.
const WORD = /[\p{L}\p{N}#](?:[\p{L}\p{N}#._/-]*[\p{L}\p{N}#])?/gu;

/**
 * The passage terms a result matched. `matched` labels are a term, or
 * "typed→synonym" for a synonym match, where the synonym is what the passage holds.
 */
function passageTerms(matched: string[]): Set<string> {
  return new Set(matched.map((label) => label.split("→").pop()!));
}

/**
 * One line cut to about EXCERPT_LINE_CHARS characters (counted per character,
 * not UTF-16 unit, so an emoji isn't split). If matched words would be cut
 * off, the window moves (with a leading "…") to show them: all of them when
 * they fit, else the first one with a little context before it.
 */
function cutLine(line: string, terms: Set<string>): string {
  const chars = Array.from(line.trimEnd());
  const L = EXCERPT_LINE_CHARS;
  if (chars.length <= L) return chars.join("");
  const spans = [...line.matchAll(WORD)]
    .filter((m) => tokenize(m[0]).some((t) => terms.has(t)))
    .map((m) => {
      const at = Array.from(line.slice(0, m.index)).length;
      return { at, end: at + Array.from(m[0]).length };
    });
  let from = 0;
  if (spans.length > 0) {
    const first = spans[0].at;
    const last = spans[spans.length - 1].end;
    if (last > L) from = last - first <= L ? last - L : first - CONTEXT_BEFORE;
    from = Math.max(0, Math.min(from, chars.length - L));
  }
  const window = chars.slice(from, from + L).join("");
  return (from > 0 ? ELLIPSIS + window.trimStart() : window).trimEnd() + (from + L < chars.length ? ELLIPSIS : "");
}

/**
 * The lines of a passage that show why it matched: up to EXCERPT_LINES lines
 * holding the most matched terms, in file order, each with its real line
 * number. A short passage is shown whole; if no line holds a matched term,
 * its first lines are shown. Text is the file's own (trailing spaces dropped).
 */
export function excerpt(passage: Passage, matched: string[]): ExcerptLine[] {
  const terms = passageTerms(matched);
  const lines = passage.text.split("\n").map((text, i) => ({ i, text }));
  let chosen = lines;
  if (lines.length > EXCERPT_LINES) {
    const scored = lines
      .map((l) => ({ ...l, hits: new Set(tokenize(l.text).filter((t) => terms.has(t))).size }))
      .filter((l) => l.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.i - b.i)
      .slice(0, EXCERPT_LINES);
    chosen = scored.length > 0 ? scored.sort((a, b) => a.i - b.i) : lines.slice(0, EXCERPT_LINES);
  }
  return chosen.map((l) => ({ line: passage.startLine + l.i, text: cutLine(l.text, terms) }));
}

/**
 * An excerpt as indented text: "  54│ text", with a "…" row wherever lines of
 * the passage were left out (before, between or after the shown ones).
 */
export function excerptText(passage: Passage, lines: ExcerptLine[]): string[] {
  const width = Math.max(...lines.map((l) => String(l.line).length));
  const gap = `     ${ELLIPSIS.padStart(width)}│`;
  const out: string[] = [];
  let next = passage.startLine;
  for (const l of lines) {
    if (l.line > next) out.push(gap);
    out.push(`     ${String(l.line).padStart(width)}│ ${l.text}`);
    next = l.line + 1;
  }
  if (next <= passage.endLine) out.push(gap);
  return out;
}

/** `file:12` for a one-line passage, `file:12-15` otherwise. */
export function citation(file: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
}

const MEMORY = MEMORY_DIRS.join(", ");
const memoryList = MEMORY_DIRS.join(" and ");

/** The human-readable output (plain text, ends with a newline). */
export function formatHuman(response: SearchResponse, meta: FormatMeta): string {
  const out: string[] = [];
  if (response.truncated) {
    out.push(`Note: your question was cut to its first ${MAX_QUERY_CHARS} characters before searching.`, "");
  }

  if (response.label === "nothing related") {
    out.push(`Nothing related found in the team's notes (${MEMORY}).`);
  } else if (response.results.length === 0) {
    out.push("No passages requested (--limit 0), so none are shown.");
  } else {
    if (response.lowOverlap) {
      out.push(
        `⚠ These words don't appear in the team's notes: ${response.unknownTerms.join(", ")}. The passages may be unrelated.`,
        ""
      );
    }
    out.push("Closest passages in the team's notes — check whether they answer your question:", "");
    response.results.forEach(({ passage, matched }, i) => {
      // A passage that is just its heading line would show the heading twice.
      const isHeading = passage.startLine === passage.endLine && /^#{1,6}\s/.test(passage.text);
      const heading = passage.heading && !isHeading ? `  (${passage.heading})` : "";
      out.push(`${i + 1}. ${citation(passage.file, passage.startLine, passage.endLine)}${heading}`);
      out.push(...excerptText(passage, excerpt(passage, matched)), "");
    });
    if (!response.lowOverlap && response.unknownTerms.length > 0) {
      out.push(`Note: not found in the notes: ${response.unknownTerms.join(", ")}.`);
    }
  }

  if (out[out.length - 1] !== "") out.push("");
  out.push(
    `Searched ${meta.passageCount} passages in ${memoryList}. Keyword search only — it finds passages, it doesn't decide the answer.`
  );
  return out.join("\n") + "\n";
}

/**
 * What `--json` prints, for agents. Read `label` first: "nothing related" has
 * no results and lowOverlap false (the label already says it). Scores are
 * rounded to 2 decimals; stems are left out. Each excerpt line carries its real
 * line number; a gap in the numbers means lines were left out.
 */
export interface JsonOutput {
  question: string;
  label: SearchResponse["label"];
  lowOverlap: boolean;
  unknownTerms: string[];
  truncated: boolean;
  results: { file: string; startLine: number; endLine: number; heading: string; score: number; excerpt: ExcerptLine[] }[];
}

export function toJsonOutput(response: SearchResponse, meta: FormatMeta): JsonOutput {
  return {
    question: meta.question,
    label: response.label,
    lowOverlap: response.lowOverlap,
    unknownTerms: response.unknownTerms,
    truncated: response.truncated,
    results: response.results.map(({ passage, score, matched }) => ({
      file: passage.file,
      startLine: passage.startLine,
      endLine: passage.endLine,
      heading: passage.heading,
      score: Math.round(score * 100) / 100,
      excerpt: excerpt(passage, matched),
    })),
  };
}

export function formatJson(response: SearchResponse, meta: FormatMeta): string {
  return JSON.stringify(toJsonOutput(response, meta), null, 2) + "\n";
}

/** What `--json` prints when the command can't search (usage error, no memory), so stdout is always JSON. */
export function formatJsonError(message: string, exitCode: number): string {
  return JSON.stringify({ error: message, exitCode }, null, 2) + "\n";
}

/** 0 when the question touches our notes (passages shown, or --limit 0), 1 for "nothing related". */
export function exitCodeFor(response: SearchResponse): number {
  return response.label === "nothing related" ? 1 : 0;
}
