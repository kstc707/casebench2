/**
 * The rules that turn a real scikit-learn fix into a task (used by scripts/build-sklearn-tasks.ts),
 * kept pure so they can be unit-tested on small fake outcomes.
 */
import type { OfflineData, TestOutcome } from "../runner/types";

/** content/scikit-learn/<slug>/task.json: generated, never edited by hand. */
export interface SklearnTask {
  slug: string;
  /** The upstream pull request, and the commit that merged it into scikit-learn's main branch. */
  pr: number;
  mergeCommit: string;
  /** The first line of the merge commit's message. */
  upstreamTitle: string;
  /** The release the student's "before" file comes from (the version Pyodide ships). */
  base: { tag: string; commit: string };
  /** The one file the student edits, e.g. "sklearn/utils/stats.py". Stored in before/ and solution/. */
  file: string;
  /** The PR's version of the test file. Stored in tests/. */
  testFile: string;
  /** Lines the real fix added and removed in `file`: a rough size signal for the suggested order. */
  fixSize: { added: number; removed: number };
  /** Tests that fail on the "before" file and pass with the real fix. */
  failToPass: string[];
  /** Tests that pass both times and must keep passing. */
  passToPass: string[];
  /** Tests skipped both times (e.g. they need pandas, which isn't loaded). Recorded so a check can see them. */
  skipped: string[];
  /** Data the tests download, provided offline by the runner (see lib/runner/runner.py). */
  offlineData: OfflineData[];
}

/** content/scikit-learn/sources.json: the hand-written seed list the builder starts from. */
export interface SklearnSources {
  project: { name: string; repo: string; license: string };
  base: { tag: string; commit: string };
  tasks: Array<{ slug: string; pr: number; mergeCommit: string; offlineData?: OfflineData[] }>;
}

export type Outcomes = Record<string, TestOutcome>;

export interface Classified {
  failToPass: string[];
  passToPass: string[];
  skipped: string[];
  /** Why this can't be a task; empty when it can. */
  refusals: string[];
}

/**
 * failToPass: failed before and passed after. passToPass: passed both times. skipped: skipped both
 * times. All sorted. Refused when:
 * - no test goes from fail to pass;
 * - any test fails (or goes missing) with the real fix: then "every required test passes" could never
 *   be the rule for solving it;
 * - any test is skipped on one side and not the other: a skip that depends on the code hides what the
 *   test would say (and a test skipped both times is listed, so nobody mistakes it for checked).
 */
export function classifyOutcomes(before: Outcomes, after: Outcomes): Classified {
  const failToPass: string[] = [];
  const passToPass: string[] = [];
  const skipped: string[] = [];
  const brokenAfter: string[] = [];
  const skipChanged: string[] = [];
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const a = after[id];
    const b = before[id];
    if ((a === "skipped") !== (b === "skipped")) skipChanged.push(`${id} (${b ?? "not run"} → ${a ?? "not run"})`);
    else if (a === "skipped") skipped.push(id);
    else if (a === undefined) continue; // ran only before: the PR's test file is the same both times, so this can't happen
    else if (a === "failed" || a === "missing") brokenAfter.push(`${id} (${a})`);
    else if (a === "passed" && b === "failed") failToPass.push(id);
    else if (a === "passed" && b === "passed") passToPass.push(id);
  }
  const refusals: string[] = [];
  if (Object.keys(after).length === 0) refusals.push("no tests ran with the real fix");
  else if (failToPass.length === 0) refusals.push("no test goes from failing to passing");
  if (brokenAfter.length) {
    refusals.push(`${brokenAfter.length} test(s) don't pass with the real fix: ${brokenAfter.slice(0, 5).join(", ")}`);
  }
  if (skipChanged.length) {
    refusals.push(`${skipChanged.length} test(s) are skipped on one side only: ${skipChanged.slice(0, 5).join(", ")}`);
  }
  return { failToPass, passToPass, skipped, refusals };
}

/** Counts the lines a unified diff adds and removes (not its "+++"/"---" headers). */
export function diffSize(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/**
 * Splits the Python files a fix changed into the one source file and the one test file. Returns a
 * refusal instead when there isn't exactly one of each (this section keeps to one editable file).
 */
export function splitFiles(changed: string[]): { file: string; testFile: string } | { refusal: string } {
  const py = changed.filter((f) => f.startsWith("sklearn/") && f.endsWith(".py"));
  const tests = py.filter((f) => f.includes("/tests/"));
  const src = py.filter((f) => !f.includes("/tests/"));
  if (src.length !== 1) return { refusal: `the fix changes ${src.length} source files (${src.join(", ") || "none"}); a task needs exactly 1` };
  if (tests.length !== 1) return { refusal: `the fix changes ${tests.length} test files (${tests.join(", ") || "none"}); a task needs exactly 1` };
  return { file: src[0], testFile: tests[0] };
}

/** JSON with sorted keys, 2-space indent and a final newline, so rebuilding gives identical bytes. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}
