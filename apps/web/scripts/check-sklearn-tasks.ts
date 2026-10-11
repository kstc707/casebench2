/**
 * Checks every scikit-learn task with the same Pyodide runner the browser uses (CI's "tasks" job). For
 * each task (rules in lib/sklearn/checkTask.ts):
 *
 *   - the `before` file is byte-identical to the file inside the scikit-learn 1.8.0 package;
 *   - `before` + fix.diff gives exactly the `solution` file;
 *   - the whole PR test file, run on `before` and on `solution`, re-classifies to exactly the recorded
 *     failToPass, passToPass and skipped lists, with no test failing on the solution and at least one
 *     failToPass test.
 *
 * Needs public/pyodide (`pnpm --filter @casebench2/web pyodide`). Usage:
 *   pnpm --filter @casebench2/web check-tasks [--content <dir>]     (default: content/scikit-learn)
 * Exits 1 if any task fails a check, or if there are no tasks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { startRunner, type Runner } from "../lib/runner/runner";
import { checkTask } from "../lib/sklearn/checkTask";
import type { SklearnSources, SklearnTask } from "../lib/sklearn/taskRules";

function contentDir(): string {
  const i = process.argv.indexOf("--content");
  if (i === -1) return path.resolve(__dirname, "../../../content/scikit-learn");
  const v = process.argv[i + 1];
  if (!v) throw new Error("--content needs a folder");
  return path.resolve(v);
}

async function check(runner: Runner, dir: string, slug: string): Promise<{ problems: string[]; line: string }> {
  const read = (f: string) => readFileSync(path.join(dir, slug, f), "utf8");
  const task = JSON.parse(read("task.json")) as SklearnTask;
  const before = read(`before/${task.file}`);
  const solution = read(`solution/${task.file}`);
  const tests = read(`tests/${task.testFile}`);
  const options = { offlineData: task.offlineData ?? [] };
  const beforeRun = await runner.run({ [task.file]: before, [task.testFile]: tests }, [task.testFile], options);
  const solutionRun = await runner.run({ [task.file]: solution, [task.testFile]: tests }, [task.testFile], options);
  const problems = checkTask({ task, shipped: runner.installedFile(task.file), before, solution, fixDiff: read("fix.diff"), beforeRun, solutionRun });
  const count = (r: typeof beforeRun, o: string) => r.results.filter((t) => t.outcome === o).length;
  const line =
    `${slug} (#${task.pr}): before ${count(beforeRun, "failed")} failed / ${count(beforeRun, "passed")} passed (${(beforeRun.durationMs / 1000).toFixed(1)} s); ` +
    `real fix ${count(solutionRun, "passed")} passed / ${count(solutionRun, "failed")} failed (${(solutionRun.durationMs / 1000).toFixed(1)} s); ` +
    `${count(solutionRun, "skipped")} skipped`;
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
      result = await check(runner, dir, slug);
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
