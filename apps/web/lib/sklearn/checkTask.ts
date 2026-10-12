/**
 * The rules CI uses to check a built task (scripts/check-sklearn-tasks.ts), kept pure so a mistake in
 * the checker shows up in unit tests rather than as a silently green CI job.
 */
import type { RunResult } from "../runner/types";
import { classifyOutcomes, type Outcomes, type SklearnTask } from "./taskRules";

export interface TaskCheckInput {
  task: SklearnTask;
  /** The file as shipped in the installed scikit-learn. */
  shipped: string;
  before: string;
  solution: string;
  fixDiff: string;
  /** The test file as shipped in the installed scikit-learn 1.8.0 tests. */
  shippedTests: string;
  /** tests/<testFile>: what the student's code is tested with. */
  tests: string;
  /** tests.diff: the PR's change to the test file. */
  testsDiff: string;
  /** The whole test file, run on "before" and on the solution. */
  beforeRun: RunResult;
  solutionRun: RunResult;
}

/**
 * Applies a unified diff (as written by `git diff`) to text, strictly: every context and removed line
 * must match exactly where the hunk says. Throws on any mismatch.
 */
export function applyUnifiedDiff(text: string, diff: string): string {
  const src = text.split("\n");
  const out: string[] = [];
  let pos = 0; // index in src of the next line not yet copied
  const lines = diff.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].startsWith("@@")) i++;
  if (i === lines.length) throw new Error("the diff has no hunks");
  while (i < lines.length && lines[i].startsWith("@@")) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
    if (!m) throw new Error(`bad hunk header: ${lines[i]}`);
    const start = Number(m[1]) - (m[2] === "0" ? 0 : 1);
    if (start < pos) throw new Error(`hunks overlap at line ${m[1]}`);
    out.push(...src.slice(pos, start));
    pos = start;
    i++;
    for (; i < lines.length && !lines[i].startsWith("@@"); i++) {
      const l = lines[i];
      if (l.startsWith("\\")) continue; // "\ No newline at end of file"
      if (l === "" && i === lines.length - 1) break; // the diff's final newline
      const body = l.slice(1);
      if (l.startsWith("+")) out.push(body);
      else if (l.startsWith(" ") || l.startsWith("-")) {
        if (src[pos] !== body) throw new Error(`the diff doesn't match line ${pos + 1}: expected ${JSON.stringify(body)}, found ${JSON.stringify(src[pos])}`);
        if (l.startsWith(" ")) out.push(body);
        pos++;
      } else throw new Error(`unexpected diff line: ${l}`);
    }
  }
  out.push(...src.slice(pos));
  return out.join("\n");
}

const outcomesOf = (r: RunResult): Outcomes => Object.fromEntries(r.results.map((t) => [t.id, t.outcome]));

function sameList(name: string, recorded: string[], found: string[]): string[] {
  const rec = new Set(recorded);
  const got = new Set(found);
  const extra = found.filter((id) => !rec.has(id));
  const gone = recorded.filter((id) => !got.has(id));
  const problems: string[] = [];
  if (extra.length) problems.push(`${name}: ${extra.length} test(s) not in task.json: ${extra.slice(0, 5).join(", ")}`);
  if (gone.length) problems.push(`${name}: ${gone.length} test(s) in task.json aren't ${name} now: ${gone.slice(0, 5).join(", ")}`);
  return problems;
}

/**
 * Everything wrong with a built task; empty when it passes. A task passes when its "before" file is the
 * shipped one, "before" plus fix.diff gives the solution, the shipped test file plus tests.diff gives
 * tests/ (so nobody can weaken the tests), and re-running the whole test file on both
 * gives exactly the recorded failToPass, passToPass and skipped lists (re-classified with the same rules
 * the builder uses), with at least one failToPass test.
 */
export function checkTask(input: TaskCheckInput): string[] {
  const { task } = input;
  const problems: string[] = [];
  if (input.before !== input.shipped) problems.push(`before/${task.file} isn't the file shipped in scikit-learn ${task.base.tag}`);
  try {
    if (applyUnifiedDiff(input.before, input.fixDiff) !== input.solution) problems.push(`before/${task.file} + fix.diff isn't solution/${task.file}`);
  } catch (err) {
    problems.push(`fix.diff doesn't apply to before/${task.file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    if (applyUnifiedDiff(input.shippedTests, input.testsDiff) !== input.tests) {
      problems.push(`tests/${task.testFile} isn't the ${task.base.tag} test file + tests.diff (the PR's test changes)`);
    }
  } catch (err) {
    problems.push(`tests.diff doesn't apply to the ${task.base.tag} ${task.testFile}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (task.failToPass.length === 0) problems.push("task.json lists no failToPass tests");
  if (input.beforeRun.error) problems.push(`before: pytest couldn't run the tests:\n${input.beforeRun.error}`);
  if (input.solutionRun.error) problems.push(`with the real fix: pytest couldn't run the tests:\n${input.solutionRun.error}`);

  const found = classifyOutcomes(outcomesOf(input.beforeRun), outcomesOf(input.solutionRun));
  problems.push(...found.refusals);
  problems.push(...sameList("failToPass", task.failToPass, found.failToPass));
  problems.push(...sameList("passToPass", task.passToPass, found.passToPass));
  problems.push(...sameList("skipped", task.skipped, found.skipped));
  return problems;
}
