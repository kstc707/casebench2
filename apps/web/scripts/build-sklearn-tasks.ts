/**
 * Builds the scikit-learn track's tasks from real, merged fixes (a port of the researcher's
 * build_tasks.py). For each entry in content/scikit-learn/sources.json it:
 *
 *   1. finds the one source file and one test file the merge commit changed;
 *   2. takes both files as shipped in the base release (1.8.0, the version Pyodide has) and applies the
 *      real fix's diff to them with `patch --fuzz=0` (shifted lines are fine, guessed context is not);
 *   3. runs the whole PR test file on "before" (1.8.0 source + PR tests) and "after" (fixed source + PR
 *      tests) with the same Pyodide runner the browser uses (lib/runner);
 *   4. records failToPass, passToPass and skipped, refusing the task if no test goes from fail to pass, if any test
 *      fails with the fix, if a test is skipped on
 *      one side only, or if the patch doesn't apply cleanly. Data a task's tests would download is provided
 *      offline when sources.json lists it (`offlineData`, see lib/runner/runner.py);
 *   5. writes content/scikit-learn/<slug>/{task.json, before/<path>, tests/<path>, solution/<path>,
 *      fix.diff, tests.diff}, and content/scikit-learn/LICENSE (scikit-learn's BSD-3 licence, from the base release).
 *
 * Hand-written files (about.json, source.md) are never touched. The output is deterministic (sorted keys,
 * LF line endings, no timestamps), so running it twice changes nothing.
 *
 * Needs a scikit-learn clone (a blob-less clone is enough) and public/pyodide (`pnpm pyodide`). Usage:
 *   pnpm --filter @casebench2/web build-tasks --repo /path/to/scikit-learn [--only <slug>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRunner, type Runner } from "../lib/runner/runner";
import type { OfflineData } from "../lib/runner/types";
import type { Outcomes } from "../lib/sklearn/taskRules";
import { classifyOutcomes, diffSize, splitFiles, stableJson, type SklearnSources, type SklearnTask } from "../lib/sklearn/taskRules";

const contentDir = path.resolve(__dirname, "../../../content/scikit-learn");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function writeFile(file: string, text: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Applies a unified diff to the given files in a scratch folder; returns the patched files or a refusal. */
function applyPatch(files: Record<string, string>, diff: string): { patched: Record<string, string> } | { refusal: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sklearn-task-"));
  try {
    for (const [f, text] of Object.entries(files)) writeFile(path.join(dir, f), text);
    const p = spawnSync("patch", ["-p1", "--fuzz=0", "--no-backup-if-mismatch", "--forward", "--batch"], { cwd: dir, input: diff, encoding: "utf8" });
    if (p.status !== 0) return { refusal: `the fix doesn't apply cleanly to the base release:\n${p.stdout}${p.stderr}` };
    return { patched: Object.fromEntries(Object.keys(files).map((f) => [f, readFileSync(path.join(dir, f), "utf8")])) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The real fix as a diff between the student's "before" file and the solution, paths a/<file> b/<file>. */
function fixDiff(file: string, before: string, after: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sklearn-diff-"));
  try {
    writeFile(path.join(dir, "a", file), before);
    writeFile(path.join(dir, "b", file), after);
    const d = spawnSync("git", ["diff", "--no-index", "--no-prefix", "--no-color", "--full-index", `a/${file}`, `b/${file}`], { cwd: dir, encoding: "utf8" });
    if (d.status !== 1) throw new Error(`git diff --no-index failed: ${d.stderr}`);
    return d.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function outcomesOf(
  runner: Runner,
  files: Record<string, string>,
  testFile: string,
  offlineData: OfflineData[]
): Promise<{ outcomes: Outcomes; error: string | null; ms: number }> {
  const r = await runner.run(files, [testFile], { offlineData });
  return { outcomes: Object.fromEntries(r.results.map((t) => [t.id, t.outcome])), error: r.error, ms: r.durationMs };
}

async function buildTask(runner: Runner, repo: string, sources: SklearnSources, entry: SklearnSources["tasks"][number]): Promise<string[]> {
  const { slug, pr, mergeCommit } = entry;
  const offlineData = entry.offlineData ?? [];
  const subject = git(repo, "log", "-1", "--format=%s", mergeCommit).trim();
  if (!subject.includes(`(#${pr})`)) return [`commit ${mergeCommit} is "${subject}", not PR #${pr}`];

  const split = splitFiles(git(repo, "show", "--name-only", "--format=", mergeCommit).split("\n").filter(Boolean));
  if ("refusal" in split) return [split.refusal];
  const { file, testFile } = split;

  const base: Record<string, string> = {};
  for (const f of [file, testFile]) base[f] = git(repo, "show", `${sources.base.commit}:${f}`);
  const applied = applyPatch(base, git(repo, "diff", `${mergeCommit}^`, mergeCommit, "--", file, testFile));
  if ("refusal" in applied) return [applied.refusal];
  const { patched } = applied;

  const before = await outcomesOf(runner, { [file]: base[file], [testFile]: patched[testFile] }, testFile, offlineData);
  const after = await outcomesOf(runner, { [file]: patched[file], [testFile]: patched[testFile] }, testFile, offlineData);
  if (after.error) return [`pytest couldn't run the tests with the real fix:\n${after.error}`];
  const { failToPass, passToPass, skipped, refusals } = classifyOutcomes(before.outcomes, after.outcomes);
  if (refusals.length) {
    // A collection error on "before" (e.g. the old code can't be imported) explains the refusal best.
    return before.error ? [...refusals, `pytest couldn't run the tests on "before":\n${before.error}`] : refusals;
  }

  const diff = fixDiff(file, base[file], patched[file]);
  // The PR's change to the test file, on top of the 1.8.0 test file: lets the checker prove tests/ is
  // exactly upstream's (a weakened test would make a wrong fix look right).
  const testsDiff = fixDiff(testFile, base[testFile], patched[testFile]);
  const task: SklearnTask = {
    slug,
    pr,
    mergeCommit,
    upstreamTitle: subject,
    base: sources.base,
    file,
    testFile,
    fixSize: diffSize(diff),
    failToPass,
    passToPass,
    skipped,
    offlineData,
  };
  const dir = path.join(contentDir, slug);
  for (const generated of ["task.json", "before", "tests", "solution", "fix.diff", "tests.diff"]) rmSync(path.join(dir, generated), { recursive: true, force: true });
  writeFile(path.join(dir, "before", file), base[file]);
  writeFile(path.join(dir, "tests", testFile), patched[testFile]);
  writeFile(path.join(dir, "solution", file), patched[file]);
  writeFile(path.join(dir, "fix.diff"), diff);
  writeFile(path.join(dir, "tests.diff"), testsDiff);
  writeFile(path.join(dir, "task.json"), stableJson(task));
  console.log(
    `ok   ${slug} (#${pr}): ${failToPass.length} fail→pass, ${passToPass.length} pass→pass, fix +${task.fixSize.added}/-${task.fixSize.removed}` +
      `, ${skipped.length} skipped (before ${(before.ms / 1000).toFixed(1)} s, after ${(after.ms / 1000).toFixed(1)} s)`
  );
  return [];
}

async function main() {
  const repo = arg("--repo");
  if (!repo) throw new Error("Usage: build-sklearn-tasks.ts --repo /path/to/scikit-learn [--only <slug>]");
  const only = arg("--only");
  const sources = JSON.parse(readFileSync(path.join(contentDir, "sources.json"), "utf8")) as SklearnSources;
  const tagCommit = git(repo, "rev-parse", `${sources.base.tag}^{commit}`).trim();
  if (tagCommit !== sources.base.commit) throw new Error(`tag ${sources.base.tag} is ${tagCommit} in ${repo}, but sources.json says ${sources.base.commit}`);
  const entries = sources.tasks.filter((t) => !only || t.slug === only);
  if (entries.length === 0) throw new Error(only ? `no task "${only}" in sources.json` : "sources.json lists no tasks");

  writeFile(path.join(contentDir, "LICENSE"), git(repo, "show", `${sources.base.commit}:COPYING`));
  const runner = await startRunner();
  console.log(`runner: scikit-learn ${runner.versions.sklearn}, pytest ${runner.versions.pytest}`);
  let refused = 0;
  for (const entry of entries) {
    const problems = await buildTask(runner, repo, sources, entry);
    if (problems.length) {
      refused++;
      console.log(`REFUSED ${entry.slug} (#${entry.pr}):\n  ${problems.join("\n  ")}`);
    }
  }
  console.log(`\n${entries.length - refused} of ${entries.length} tasks built`);
  process.exit(refused ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
