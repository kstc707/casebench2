import { describe, expect, it } from "vitest";
import { classifyOutcomes, diffSize, splitFiles, stableJson } from "./taskRules";

describe("classifyOutcomes", () => {
  it("sorts tests into failToPass and passToPass, sorted, leaving skipped ones out", () => {
    const before = { "t.py::c": "failed", "t.py::a": "passed", "t.py::b": "failed", "t.py::s": "skipped", "t.py::z": "passed" } as const;
    const after = { "t.py::z": "passed", "t.py::b": "passed", "t.py::c": "passed", "t.py::a": "passed", "t.py::s": "skipped" } as const;
    expect(classifyOutcomes(before, after)).toEqual({
      failToPass: ["t.py::b", "t.py::c"],
      passToPass: ["t.py::a", "t.py::z"],
      skipped: ["t.py::s"],
      refusals: [],
    });
  });

  it("leaves out a test that only exists after the fix", () => {
    const r = classifyOutcomes({ "t.py::a": "failed" }, { "t.py::a": "passed", "t.py::new": "passed" });
    expect(r).toEqual({ failToPass: ["t.py::a"], passToPass: [], skipped: [], refusals: [] });
  });

  it("refuses when a test is skipped on one side only", () => {
    const r = classifyOutcomes(
      { "t.py::a": "failed", "t.py::s": "skipped", "t.py::u": "passed" },
      { "t.py::a": "passed", "t.py::s": "passed", "t.py::u": "skipped" }
    );
    expect(r.refusals).toEqual(["2 test(s) are skipped on one side only: t.py::s (skipped → passed), t.py::u (passed → skipped)"]);
  });

  it("refuses when no test goes from failing to passing", () => {
    expect(classifyOutcomes({ "t.py::a": "passed" }, { "t.py::a": "passed" }).refusals).toEqual(["no test goes from failing to passing"]);
  });

  it("refuses when any test fails or goes missing with the real fix, naming it", () => {
    const r = classifyOutcomes({ "t.py::a": "failed", "t.py::b": "passed" }, { "t.py::a": "passed", "t.py::b": "failed", "t.py": "missing" });
    expect(r.refusals).toEqual(["2 test(s) don't pass with the real fix: t.py (missing), t.py::b (failed)"]);
  });

  it("refuses when nothing ran", () => {
    expect(classifyOutcomes({}, {}).refusals).toEqual(["no tests ran with the real fix"]);
  });
});

describe("diffSize", () => {
  it("counts added and removed lines, not the file headers", () => {
    const diff = ["--- a/sklearn/x.py", "+++ b/sklearn/x.py", "@@ -1,3 +1,4 @@", " keep", "-old", "+new", "+more", ""].join("\n");
    expect(diffSize(diff)).toEqual({ added: 2, removed: 1 });
  });
});

describe("splitFiles", () => {
  it("finds the one source file and the one test file, ignoring docs", () => {
    expect(splitFiles(["doc/whats_new/upcoming_changes/x.rst", "sklearn/utils/stats.py", "sklearn/utils/tests/test_stats.py"])).toEqual({
      file: "sklearn/utils/stats.py",
      testFile: "sklearn/utils/tests/test_stats.py",
    });
  });

  it("refuses fixes that change several source files or no test file", () => {
    expect(splitFiles(["sklearn/a.py", "sklearn/b.py", "sklearn/tests/test_a.py"])).toEqual({ refusal: expect.stringContaining("2 source files") });
    expect(splitFiles(["sklearn/a.py"])).toEqual({ refusal: expect.stringContaining("0 test files") });
  });
});

describe("stableJson", () => {
  it("sorts keys at every level and ends with a newline, so rebuilding gives the same bytes", () => {
    expect(stableJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 2 } })).toBe(stableJson({ a: { c: 2, d: [{ y: 2, z: 1 }] }, b: 1 }));
    expect(stableJson({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });
});
