import { describe, expect, it } from "vitest";
import type { RunResult, TestOutcome } from "../runner/types";
import { explainRunError, findSymbolLine, judgeCheck, runSummary } from "./runReport";

const result = (outcomes: Record<string, TestOutcome>, error: string | null = null): RunResult => ({
  results: Object.entries(outcomes).map(([id, outcome]) => ({ id, outcome })),
  error,
  durationMs: 1,
});
const required = ["t::bug", "t::ok1", "t::ok2"];

describe("judgeCheck: solved only when every required test passed", () => {
  it("solves when all required tests pass (extra tests don't matter)", () => {
    expect(judgeCheck(required, result({ "t::bug": "passed", "t::ok1": "passed", "t::ok2": "passed", "t::other": "failed" }))).toMatchObject({
      solved: true,
      passed: 3,
      total: 3,
      failing: [],
      missing: [],
    });
  });

  it("doesn't solve with a failure, a skip, or a test that didn't run", () => {
    const failed = judgeCheck(required, result({ "t::bug": "failed", "t::ok1": "passed", "t::ok2": "passed" }));
    expect(failed).toMatchObject({ solved: false, passed: 2 });
    expect(failed.failing.map((r) => r.id)).toEqual(["t::bug"]);
    expect(judgeCheck(required, result({ "t::bug": "passed", "t::ok1": "skipped", "t::ok2": "passed" })).solved).toBe(false);
    const notRun = judgeCheck(required, result({ "t::bug": "passed", "t::ok1": "passed" }));
    expect(notRun).toMatchObject({ solved: false, missing: ["t::ok2"] });
    expect(judgeCheck(required, result({ "t::bug": "passed", "t::ok1": "passed", "t::ok2": "missing" })).missing).toEqual(["t::ok2"]);
  });

  it("doesn't solve when pytest reported an error, or with nothing required", () => {
    expect(judgeCheck(required, result({ "t::bug": "passed", "t::ok1": "passed", "t::ok2": "passed" }, "boom")).solved).toBe(false);
    expect(judgeCheck([], result({})).solved).toBe(false);
  });
});

// The error texts below are real runner output (Pyodide 314.0.7, scikit-learn 1.8.0, task #33127).
const FILE = "sklearn/utils/stats.py";
describe("explainRunError", () => {
  it("a syntax error: names the line and the message", () => {
    const err = [
      "ImportError while loading conftest '/lib/python3.14/site-packages/sklearn/conftest.py'.",
      '  File "/lib/python3.14/site-packages/sklearn/utils/stats.py", line 192',
      "    if next_index >= max_idx",
      "                            ^",
      "SyntaxError: expected ':'",
    ].join("\n");
    expect(explainRunError(err, FILE)).toEqual({ headline: "Your file has a syntax error on line 192: expected ':'", line: 192, details: err });
  });

  it("an indentation error", () => {
    const err = [
      "ImportError while loading conftest '/lib/python3.14/site-packages/sklearn/conftest.py'.",
      '  File "/lib/python3.14/site-packages/sklearn/utils/stats.py", line 192',
      "    if next_index >= max_idx:",
      "                             ^",
      "IndentationError: unindent does not match any outer indentation level",
    ].join("\n");
    expect(explainRunError(err, FILE).headline).toBe("Your file has an indentation error on line 192: unindent does not match any outer indentation level");
  });

  it("another error while loading the file", () => {
    const err = "ImportError while loading conftest '/lib/python3.14/site-packages/sklearn/conftest.py'.\nNameError: name 'undefined_name_here' is not defined";
    expect(explainRunError(err, FILE)).toMatchObject({
      headline: "Your file couldn't be loaded (somewhere at the top level of your file): NameError: name 'undefined_name_here' is not defined",
      line: undefined,
    });
    // With the line the runner found by importing the file by itself:
    expect(explainRunError(err, FILE, 216)).toMatchObject({ headline: "Your file couldn't be loaded (line 216): NameError: name 'undefined_name_here' is not defined", line: 216 });
  });

  it("a name scikit-learn imports from the student's file that it no longer defines", () => {
    const err = [
      "ImportError while loading conftest '/lib/python3.14/site-packages/sklearn/conftest.py'.",
      "ImportError: cannot import name '_weighted_percentile' from 'sklearn.utils.stats' (/lib/python3.14/site-packages/sklearn/utils/stats.py)",
    ].join("\n");
    expect(explainRunError(err, FILE).headline).toBe("scikit-learn imports `_weighted_percentile` from your file, but your file no longer defines it.");
    // ... but not for some other module
    expect(explainRunError(err.replace("sklearn.utils.stats", "sklearn.utils.other"), FILE).headline).not.toMatch(/your file no longer defines/);
  });

  it("a test id that doesn't exist: says pytest ran nothing and it's not the student's fault", () => {
    const err = [
      "no tests ran in 1.92s",
      "ERROR: not found: /lib/python3.14/site-packages/sklearn/utils/tests/test_stats.py::test_weighted_percentile_average_zero_weight_plateau_typo",
      "(no match in any of [<Module test_stats.py>])",
    ].join("\n");
    expect(explainRunError(err, FILE).headline).toMatch(/^One of this task's tests couldn't be found, so pytest ran none of them\. This is probably a problem with the task/);
  });

  it("ignores line numbers from other files, and falls back to pytest's last error line", () => {
    const err = '  File "/lib/python3.14/site-packages/sklearn/base.py", line 5\nRuntimeError: odd';
    expect(explainRunError(err, FILE)).toMatchObject({ headline: "pytest couldn't run the tests: RuntimeError: odd", line: undefined });
  });
});

describe("findSymbolLine", () => {
  const code = ["import x", "", "def helper():", "    pass", "", "class Pipeline:", "    def fit(self):", "        pass", "", "    @property", "    def _final_estimator(self):", "        pass", "", "def fit():", "    pass"].join("\n");
  it("finds a function, a class, and a method inside its class", () => {
    expect(findSymbolLine(code, "helper")).toBe(3);
    expect(findSymbolLine(code, "Pipeline")).toBe(6);
    expect(findSymbolLine(code, "Pipeline._final_estimator")).toBe(11);
    expect(findSymbolLine(code, "Pipeline.fit")).toBe(7);
    expect(findSymbolLine(code, "fit")).toBe(7); // first definition anywhere
    expect(findSymbolLine(code, "missing")).toBeNull();
  });
});

describe("findSymbolLine on the real tasks", () => {
  it("finds every task's 'where to look' in its before file (so 'Jump to it' always shows)", async () => {
    const { getTask, listTasks } = await import("../tasks");
    for (const { slug } of listTasks()) {
      const t = getTask(slug)!;
      expect(findSymbolLine(t.before, t.about.whereToLook.symbol), slug).toBeGreaterThan(0);
    }
  });
});

describe("runSummary (what the live region announces)", () => {
  it("says how many tests pass, or that it's solved, or the plain error", () => {
    const all = { "t::bug": "passed", "t::ok1": "passed", "t::ok2": "failed" } as const;
    expect(runSummary("issue", result(all), ["t::bug"], required, FILE)).toBe("1 of 1 of the issue's tests pass.");
    expect(runSummary("check", result(all), ["t::bug"], required, FILE)).toBe("2 of 3 required tests pass.");
    expect(runSummary("check", result({ ...all, "t::ok2": "passed" }), ["t::bug"], required, FILE)).toBe("Solved. All 3 required tests pass.");
    const err = { ...result({}, "ImportError while loading conftest 'x'.\nNameError: name 'y' is not defined"), errorLine: 7 };
    expect(runSummary("check", err, ["t::bug"], required, FILE)).toBe("Your file couldn't be loaded (line 7): NameError: name 'y' is not defined");
  });
});
