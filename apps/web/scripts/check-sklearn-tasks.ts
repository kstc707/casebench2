/**
 * Checks every scikit-learn task with the same Pyodide runner the browser uses (CI's "tasks" job):
 *
 *   - the task's `before` file is byte-identical to the file inside the scikit-learn 1.8.0 package;
 *   - on `before` (with the PR's test file), every failToPass test fails and every passToPass test passes,
 *     so the task can be solved and "solved" means the right thing;
 *   - with `solution` (the real fix), every required test passes.
 *
 * Needs public/pyodide (`pnpm --filter @casebench2/web pyodide`). Usage:
 *   pnpm --filter @casebench2/web check-tasks [--content <dir>]     (default: content/scikit-learn)
 * Exits 1 if any task fails a check, or if there are no tasks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { startRunner, type Runner } from "../lib/runner/runner";
import type { RunResult } from "../lib/runner/types";
import type { SklearnSources, SklearnTask } from "../lib/sklearn/taskRules";

function contentDir(): string {
  const i = process.argv.indexOf("--content");
  if (i === -1) return path.resolve(__dirname, "../../../content/scikit-learn");
  const v = process.argv[i + 1];
  if (!v) throw new Error("--content needs a folder");
  return path.resolve(v);
}

const outcomesOf = (r: RunResult) => new Map(r.results.map((t) => [t.id, t.outcome]));

/** Problems with one task; empty when it passes every check. */
async function checkTask(runner: Runner, dir: string, slug: string): Promise<{ problems: string[]; line: string }> {
  const task = JSON.parse(readFileSync(path.join(dir, slug, "task.json"), "utf8")) as SklearnTask;
  const before = readFileSync(path.join(dir, slug, "before", task.file), "utf8");
  const solution = readFileSync(path.join(dir, slug, "solution", task.file), "utf8");
  const tests = readFileSync(path.join(dir, slug, "tests", task.testFile), "utf8");
  const required = [...task.failToPass, ...task.passToPass];
  const problems: string[] = [];

  if (before !== runner.installedFile(task.file)) problems.push(`before/${task.file} isn't the file shipped in scikit-learn ${task.base.tag}`);

  const b = await runner.run({ [task.file]: before, [task.testFile]: tests }, required);
  if (b.error) problems.push(`before: pytest couldn't run the tests:\n${b.error}`);
  const bo = outcomesOf(b);
  for (const id of task.failToPass) if (bo.get(id) !== "failed") problems.push(`before: expected ${id} to fail, got ${bo.get(id)}`);
  for (const id of task.passToPass) if (bo.get(id) !== "passed") problems.push(`before: expected ${id} to pass, got ${bo.get(id)}`);

  const s = await runner.run({ [task.file]: solution, [task.testFile]: tests }, required);
  if (s.error) problems.push(`with the real fix: pytest couldn't run the tests:\n${s.error}`);
  const notPassing = s.results.filter((r) => r.outcome !== "passed");
  for (const r of notPassing) problems.push(`with the real fix: expected ${r.id} to pass, got ${r.outcome}`);

  const failingBefore = b.results.filter((r) => r.outcome !== "passed").length;
  const line =
    `${slug} (#${task.pr}): before ${failingBefore} of ${required.length} not passing (${(b.durationMs / 1000).toFixed(1)} s); ` +
    `real fix ${required.length - notPassing.length}/${required.length} pass (${(s.durationMs / 1000).toFixed(1)} s)`;
  return { problems, line };
}

async function main() {
  const dir = contentDir();
  const sources = JSON.parse(readFileSync(path.join(dir, "sources.json"), "utf8")) as SklearnSources;
  if (sources.tasks.length === 0) throw new Error(`${dir}/sources.json lists no tasks`);
  const runner = await startRunner();
  console.log(`runner: scikit-learn ${runner.versions.sklearn}, pytest ${runner.versions.pytest}, Python ${runner.versions.python}`);

  let failed = 0;
  for (const { slug } of sources.tasks) {
    let result: { problems: string[]; line: string };
    try {
      result = await checkTask(runner, dir, slug);
    } catch (err) {
      result = { problems: [err instanceof Error ? err.message : String(err)], line: slug };
    }
    console.log(`${result.problems.length ? "FAIL" : "ok  "} ${result.line}`);
    for (const p of result.problems.slice(0, 8)) console.log(`     ${p}`);
    if (result.problems.length > 8) console.log(`     … and ${result.problems.length - 8} more`);
    if (result.problems.length) failed++;
  }
  console.log(`\n${sources.tasks.length - failed} of ${sources.tasks.length} tasks OK`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
