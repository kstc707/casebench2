import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunResult, TestOutcome } from "../runner/types";
import { applyUnifiedDiff, checkTask, type TaskCheckInput } from "./checkTask";
import type { SklearnTask } from "./taskRules";

const run = (outcomes: Record<string, TestOutcome>, error: string | null = null): RunResult => ({
  results: Object.entries(outcomes).map(([id, outcome]) => ({ id, outcome })),
  error,
  durationMs: 1,
});

const before = "a = 1\nb = 2\nc = 3\n";
const solution = "a = 1\nb = 20\nc = 3\n";
const fixDiff = [
  "diff --git a/sklearn/x.py b/sklearn/x.py",
  "--- a/sklearn/x.py",
  "+++ b/sklearn/x.py",
  "@@ -1,3 +1,3 @@",
  " a = 1",
  "-b = 2",
  "+b = 20",
  " c = 3",
  "",
].join("\n");

const task: SklearnTask = {
  slug: "demo",
  pr: 1,
  mergeCommit: "m",
  upstreamTitle: "FIX demo (#1)",
  base: { tag: "1.8.0", commit: "b" },
  file: "sklearn/x.py",
  testFile: "sklearn/tests/test_x.py",
  fixSize: { added: 1, removed: 1 },
  failToPass: ["t::bug"],
  passToPass: ["t::ok"],
  skipped: ["t::skip"],
  offlineData: [],
};

const good: TaskCheckInput = {
  task,
  shipped: before,
  before,
  solution,
  fixDiff,
  beforeRun: run({ "t::bug": "failed", "t::ok": "passed", "t::skip": "skipped" }),
  solutionRun: run({ "t::bug": "passed", "t::ok": "passed", "t::skip": "skipped" }),
};

describe("checkTask", () => {
  it("passes a task whose files and outcomes match task.json exactly", () => {
    expect(checkTask(good)).toEqual([]);
  });

  it("fails when the before file isn't the shipped one", () => {
    expect(checkTask({ ...good, shipped: "other" })).toEqual(["before/sklearn/x.py isn't the file shipped in scikit-learn 1.8.0"]);
  });

  it("fails when before + fix.diff isn't the solution, or the diff doesn't apply", () => {
    expect(checkTask({ ...good, solution: "a = 1\nb = 21\nc = 3\n" })).toContain("before/sklearn/x.py + fix.diff isn't solution/sklearn/x.py");
    expect(checkTask({ ...good, fixDiff: fixDiff.replace("-b = 2", "-b = 3") })[0]).toMatch(/^fix\.diff doesn't apply to before\/sklearn\/x\.py: the diff doesn't match line 2/);
  });

  it("fails when a failToPass test passes on before (it no longer proves the bug)", () => {
    const problems = checkTask({ ...good, beforeRun: run({ "t::bug": "passed", "t::ok": "passed", "t::skip": "skipped" }) });
    expect(problems).toContain("no test goes from failing to passing");
    expect(problems).toContain("failToPass: 1 test(s) in task.json aren't failToPass now: t::bug");
    expect(problems).toContain("passToPass: 1 test(s) not in task.json: t::bug");
  });

  it("fails when any test fails with the real fix", () => {
    const problems = checkTask({ ...good, solutionRun: run({ "t::bug": "passed", "t::ok": "failed", "t::skip": "skipped" }) });
    expect(problems).toContain("1 test(s) don't pass with the real fix: t::ok (failed)");
  });

  it("fails when a recorded test is skipped now, or a skipped one runs now", () => {
    const nowSkipped = checkTask({
      ...good,
      beforeRun: run({ "t::bug": "failed", "t::ok": "skipped", "t::skip": "skipped" }),
      solutionRun: run({ "t::bug": "passed", "t::ok": "skipped", "t::skip": "skipped" }),
    });
    expect(nowSkipped).toEqual(["passToPass: 1 test(s) in task.json aren't passToPass now: t::ok", "skipped: 1 test(s) not in task.json: t::ok"]);
    const nowRuns = checkTask({
      ...good,
      beforeRun: run({ "t::bug": "failed", "t::ok": "passed", "t::skip": "passed" }),
      solutionRun: run({ "t::bug": "passed", "t::ok": "passed", "t::skip": "passed" }),
    });
    expect(nowRuns).toContain("skipped: 1 test(s) in task.json aren't skipped now: t::skip");
  });

  it("fails on a wrong test id (pytest then runs nothing) and on an empty failToPass", () => {
    const err = "ERROR: not found: t::bug_typo";
    const problems = checkTask({ ...good, beforeRun: run({ "sklearn/tests/test_x.py": "missing" }, err), solutionRun: run({ "sklearn/tests/test_x.py": "missing" }, err) });
    expect(problems).toContain(`before: pytest couldn't run the tests:\n${err}`);
    expect(checkTask({ ...good, task: { ...task, failToPass: [] } })).toContain("task.json lists no failToPass tests");
  });
});

describe("applyUnifiedDiff", () => {
  it("applies every real task's fix.diff to its before file, giving the solution", () => {
    const root = path.resolve(__dirname, "../../../../content/scikit-learn");
    const slugs = (JSON.parse(readFileSync(path.join(root, "sources.json"), "utf8")) as { tasks: { slug: string }[] }).tasks.map((t) => t.slug);
    for (const slug of slugs) {
      const t = JSON.parse(readFileSync(path.join(root, slug, "task.json"), "utf8")) as SklearnTask;
      const read = (f: string) => readFileSync(path.join(root, slug, f), "utf8");
      expect(applyUnifiedDiff(read(`before/${t.file}`), read("fix.diff")), slug).toBe(read(`solution/${t.file}`));
    }
  });

  it("handles several hunks and refuses a diff with no hunks", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const diff = ["@@ -2,1 +2,1 @@", "-line 2", "+LINE 2", "@@ -15,2 +15,3 @@", " line 15", "+inserted", " line 16", ""].join("\n");
    const out = applyUnifiedDiff(text, diff).split("\n");
    expect(out[1]).toBe("LINE 2");
    expect(out.slice(14, 17)).toEqual(["line 15", "inserted", "line 16"]);
    expect(() => applyUnifiedDiff(text, "no hunks here")).toThrow(/no hunks/);
  });
});
