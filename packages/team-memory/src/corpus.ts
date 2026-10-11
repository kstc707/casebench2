/**
 * The team memory as a list of small, citable passages.
 *
 * The librarian answers questions by searching the team's own notes
 * (`.claude/team/**` and `docs/build-log/**`). Search works on passages, not
 * whole files: the spike showed that splitting only at headings and blank
 * lines leaves a whole lessons file (one long bullet list) as a single
 * passage, so we also split at every top-level bullet. Each passage keeps the
 * file and 1-based line range it came from, so an answer can cite `file:line`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Passage {
  /** Repo-relative path with forward slashes, e.g. `.claude/team/decisions.md`. */
  file: string;
  /** First line of the passage, 1-based. */
  startLine: number;
  /** Last line of the passage, 1-based and inclusive. */
  endLine: number;
  /** The nearest heading at or above the passage (without `#`s); "" if none. */
  heading: string;
  /** The passage's lines, joined with "\n". */
  text: string;
}

/** The folders (relative to the repo root) that make up the team memory. */
export const MEMORY_DIRS = [".claude/team", "docs/build-log"];

const HEADING = /^#{1,6}\s+(.*)$/;
// A bullet or numbered item starting in column 0. Indented ones are nested
// items or continuations and stay with the bullet above them.
const TOP_LEVEL_BULLET = /^([-*+]|\d+[.)])\s/;
// A code fence opener: 3+ backticks or tildes, then an info string (e.g. `bash`).
const FENCE_OPEN = /^\s*(`{3,}|~{3,})(.*)$/;
// A markdown table row (starts with "|"), and the |---|:--:| line under a table's header row.
const TABLE_ROW = /^ {0,3}\|/;
const TABLE_SEPARATOR = /^ {0,3}\|[\s:|-]*-[\s:|-]*$/;

/**
 * Which lines (0-based) sit inside a fenced code block, opener and closer
 * included. Follows CommonMark: a backtick opener's info string may not contain
 * a backtick (so "```js const x = 1```" is inline code, not a fence), and only
 * the same character, at least as long, with nothing after it, closes a fence.
 * Unlike CommonMark, an opener that never closes is treated as plain text
 * rather than running to the end of the file, so one stray ``` can't hide every
 * later heading from search.
 */
function fencedLines(lines: string[]): Set<number> {
  const fenced = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open || (open[1][0] === "`" && open[2].includes("`"))) continue;
    const [char, len] = [open[1][0], open[1].length];
    const close = lines.findIndex((l, j) => {
      if (j <= i) return false;
      const m = /^\s*(`{3,}|~{3,})\s*$/.exec(l);
      return m !== null && m[1][0] === char && m[1].length >= len;
    });
    if (close === -1) continue;
    for (let j = i; j <= close; j++) fenced.add(j);
    i = close;
  }
  return fenced;
}

/**
 * Split one markdown file into passages. Pure: no file system access.
 *
 * A new passage starts at each heading (which is also a passage of its own),
 * after each blank line, and at each top-level bullet. Each table row is a
 * passage of its own (the |---| separator line is skipped): as one passage, a
 * long table buried a fact in one row under BM25's length penalty. Fenced code
 * blocks are kept whole, so a `# comment` inside one is not mistaken for a heading.
 */
export function splitPassages(file: string, text: string): Passage[] {
  const lines = text.split(/\r?\n/);
  // A final newline is a line ending, not an extra empty line; dropping the
  // trailing "" keeps endLine within the file's real line count.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const fenced = fencedLines(lines);
  const passages: Passage[] = [];
  let heading = "";
  let current: string[] = [];
  let start = 0;

  const flush = () => {
    if (current.some((l) => l.trim() !== "")) {
      passages.push({
        file,
        startLine: start,
        endLine: start + current.length - 1,
        heading,
        text: current.join("\n"),
      });
    }
    current = [];
  };

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    if (fenced.has(i)) {
      if (current.length === 0) start = lineNo;
      current.push(line);
      return;
    }

    const headingMatch = HEADING.exec(line);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].replace(/\s+#+\s*$/, "").trim();
      start = lineNo;
      current = [line];
      flush();
      return;
    }

    if (line.trim() === "") {
      flush();
      return;
    }

    if (TABLE_ROW.test(line)) {
      flush();
      if (TABLE_SEPARATOR.test(line)) return;
      start = lineNo;
      current = [line];
      flush();
      return;
    }

    if (TOP_LEVEL_BULLET.test(line)) flush();
    if (current.length === 0) start = lineNo;
    current.push(line);
  });
  flush();

  return passages;
}

/**
 * Find the repo root by walking up to the folder that holds
 * `pnpm-workspace.yaml`. Starts from this file's folder by default, so it
 * works whatever the current directory is.
 */
export function findRepoRoot(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = path.resolve(from);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No pnpm-workspace.yaml found above ${from}`);
    dir = parent;
  }
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    // Symlinks are skipped (Dirent.isFile/isDirectory are false for them):
    // the memory is plain files in the repo, and this avoids link loops.
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
  });
}

/**
 * Read every markdown file in the team memory and split it into passages.
 *
 * One missing memory folder is allowed (a fresh checkout may not have a build
 * log yet), but finding no markdown at all throws: an empty corpus would make
 * the librarian answer "not found" to everything, a failure that looks like a
 * success.
 */
export function loadCorpus(root: string = findRepoRoot()): Passage[] {
  const files = MEMORY_DIRS.flatMap((d) => markdownFiles(path.join(root, d))).sort();
  if (files.length === 0) {
    throw new Error(`No team memory found under ${root} (looked for .md files in ${MEMORY_DIRS.join(", ")})`);
  }
  return files.flatMap((full) =>
    splitPassages(path.relative(root, full).split(path.sep).join("/"), readFileSync(full, "utf-8"))
  );
}
