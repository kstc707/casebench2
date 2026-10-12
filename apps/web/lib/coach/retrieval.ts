/**
 * Retrieval for the coach: finds the passages of scikit-learn's contributing docs that matter for a
 * review, so the AI review cites real rules instead of inventing them (and the request stays small).
 * It reuses the team librarian's passage splitter and BM25 search (packages/team-memory), which were
 * built for this repo's markdown notes; reStructuredText headings are turned into markdown ones first.
 *
 * Splitting runs at build time (lib/coach/passages.ts reads the files); the index and the search run in
 * the browser, so this file must not import node modules.
 */
import { buildIndex, search, type SearchIndex } from "@casebench2/team-memory/src/search";
import type { Passage } from "@casebench2/team-memory/src/corpus";

/** A passage the AI review can cite by id ("R1", "R2", …). */
export interface RulePassage {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  heading: string;
  text: string;
}

const UNDERLINE = /^([=\-~^"'`#*+])\1{2,}\s*$/;

/**
 * Turns reStructuredText section titles (a line followed by an underline of =, -, ~, …, optionally with
 * an overline) into "## Title", keeping every line number: the underline and overline become blank lines.
 */
export function rstHeadingsToMarkdown(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i + 1 < lines.length; i++) {
    const title = lines[i].trim();
    if (title === "" || UNDERLINE.test(lines[i]) || !UNDERLINE.test(lines[i + 1])) continue;
    if (lines[i + 1].trim().length < Math.min(title.length, 3)) continue;
    if (i > 0 && UNDERLINE.test(lines[i - 1]) && lines[i - 1][0] === lines[i + 1][0]) lines[i - 1] = "";
    lines[i] = `## ${title}`;
    lines[i + 1] = "";
  }
  return lines.join("\n");
}

/** Drops passages that are only markup (".. _label:", comments, a heading line alone). */
export function usefulPassages(passages: Passage[]): Passage[] {
  return passages.filter((p) => {
    const body = p.text
      .split("\n")
      .filter((l) => !/^\s*\.\.\s/.test(l) && !/^#{1,6}\s/.test(l) && !/^\s*<!--|-->\s*$/.test(l))
      .join(" ")
      .trim();
    return body.length >= 40;
  });
}

export function indexRules(passages: Passage[]): SearchIndex {
  return buildIndex(passages);
}

/** The questions every review asks the rules, plus the titles of any automatic checks that failed. */
export const REVIEW_QUERIES = [
  "pull request checklist unrelated lines focused scope",
  "AI tools understand explain changes automated contributions policy disclosure",
  "changelog news fragment single bullet point By user",
  "bug fix tests should fail main branch pass PR",
  "Reference Issues PRs Fixes keywords",
];

/** Top passages for several queries, without repeats, labelled R1, R2, … in order of first appearance. */
export function retrieveRules(index: SearchIndex, queries: string[], perQuery = 2, limit = 8): RulePassage[] {
  const seen = new Set<string>();
  const out: RulePassage[] = [];
  for (const q of queries) {
    for (const r of search(index, q, perQuery).results) {
      const p = r.passage;
      const key = `${p.file}:${p.startLine}`;
      if (seen.has(key) || out.length >= limit) continue;
      seen.add(key);
      out.push({ id: `R${out.length + 1}`, file: p.file, startLine: p.startLine, endLine: p.endLine, heading: p.heading, text: p.text });
    }
  }
  return out;
}
