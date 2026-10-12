import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyUnifiedDiff } from "../sklearn/checkTask";
import { getTask, listTasks } from "../tasks";
import type { TaskCoach } from "./types";
import { blockRange, looksLikeCommentedCode, changelogChecks, codeChecks, diffLines, EMPTY_PR, prBody, prChecks, RULES, unifiedDiff, fragmentPath } from "./checks";

const root = path.resolve(__dirname, "../../../../content/scikit-learn");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const byId = (rs: { id: string; ok: boolean }[]) => Object.fromEntries(rs.map((r) => [r.id, r.ok]));

describe("rules", () => {
  it.each(Object.entries(RULES))("%s quotes scikit-learn's text word for word", (_, rule) => {
    expect(squash(readFileSync(path.join(root, rule.file), "utf8"))).toContain(squash(rule.quote));
  });
});

describe("diffLines and unifiedDiff", () => {
  const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n") + "\n";
  const after = ["a", "b", "C", "d", "e", "f", "g", "h", "i2", "i", "j", "k"].join("\n") + "\n";
  it("finds added and deleted lines with their line numbers", () => {
    const d = diffLines(before, after).filter((l) => l.type !== "same");
    expect(d).toEqual([
      { type: "del", text: "c", beforeLine: 3 },
      { type: "add", text: "C", beforeLine: 4, afterLine: 3 },
      { type: "add", text: "i2", beforeLine: 9, afterLine: 9 },
      { type: "add", text: "k", beforeLine: 11, afterLine: 12 },
    ]);
  });
  it("writes a diff that applies back exactly (checked with the CI checker's strict applier)", () => {
    expect(applyUnifiedDiff(before, unifiedDiff("x.py", before, after))).toBe(after);
    expect(unifiedDiff("x.py", before, before)).toBe("");
  });
  it("round-trips every real fix", () => {
    for (const { slug } of listTasks()) {
      const t = getTask(slug)!;
      const solution = readFileSync(path.join(root, slug, "solution", t.file), "utf8");
      expect(applyUnifiedDiff(t.before, unifiedDiff(t.file, t.before, solution)), slug).toBe(solution);
    }
  });
});

describe("blockRange", () => {
  it("covers a whole top-level function, or the class for Class.method", () => {
    const code = ["import x", "", "def f(", "    a,", "):", "    return a", "", "", "class C:", "    def m(self):", "        pass", "", "def g():", "    pass"].join("\n");
    expect(blockRange(code, "f")).toEqual([3, 6]);
    expect(blockRange(code, "C.m")).toEqual([9, 11]);
    expect(blockRange(code, "nope")).toBeNull();
  });
});

describe("codeChecks", () => {
  it("passes the real fix of every task", () => {
    for (const { slug } of listTasks()) {
      const t = getTask(slug)!;
      const solution = readFileSync(path.join(root, slug, "solution", t.file), "utf8");
      const results = codeChecks({ file: t.file, before: t.before, code: solution, symbol: t.about.whereToLook.symbol, fixSize: t.fixSize, solved: true });
      expect(results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`), slug).toEqual([]);
    }
  });

  const t = getTask("weighted-percentile-zero-weight")!;
  const fix = t.before.replace("if next_index >= max_idx:", "if next_index > max_idx:");
  const base = { file: t.file, before: t.before, symbol: t.about.whereToLook.symbol, fixSize: t.fixSize, solved: true };

  it("flags style problems only on the lines you added", () => {
    const bad = fix
      .replace("if next_index > max_idx:", "if next_index > max_idx:   \n                    print(next_index)\n                    # next_index = 0\n\t\t\t\t\tpass")
      .replace("# use original `percentile_indices` again", "# use original `percentile_indices` again " + "x".repeat(60));
    const r = byId(codeChecks({ ...base, code: bad }));
    expect(r).toMatchObject({ "style-length": false, "style-whitespace": false, "style-debug": false, tests: true });
  });

  it("flags edits outside the function, whitespace-only changes and a much bigger change than the real fix", () => {
    const outside = fix.replace("# SPDX-License-Identifier: BSD-3-Clause", "# SPDX-License-Identifier: BSD-3-Clause\n# edited");
    expect(outside).not.toBe(fix);
    expect(byId(codeChecks({ ...base, code: outside }))["scope-place"]).toBe(false);
    // Re-indenting a line (e.g. wrapping it in try/except) is not "only spacing".
    const reindented = fix.replace("                    next_index = percentile_indices[col_idx]", "                        next_index = percentile_indices[col_idx]");
    expect(byId(codeChecks({ ...base, code: reindented }))["scope-unrelated"]).toBe(true);
    const spacing = fix.replace("next_index = percentile_indices[col_idx]", "next_index  =  percentile_indices[col_idx]");
    expect(spacing).not.toBe(fix);
    expect(byId(codeChecks({ ...base, code: spacing }))["scope-unrelated"]).toBe(false);
    const big = fix.replace("def _weighted_percentile(", "def _weighted_percentile(\n" + "    # note\n".repeat(20));
    expect(byId(codeChecks({ ...base, code: big }))["scope-size"]).toBe(false);
    expect(byId(codeChecks({ ...base, code: t.before }))["scope-size"]).toBe(false);
  });

  it("reports the tests check from the solved state", () => {
    expect(byId(codeChecks({ ...base, code: fix, solved: false })).tests).toBe(false);
  });
});

describe("prChecks", () => {
  it("needs a reference, an explanation and the AI disclosure", () => {
    expect(byId(prChecks(EMPTY_PR))).toEqual({ "pr-reference": false, "pr-what": false, "pr-ai": false });
    const full = { ...EMPTY_PR, reference: "Fixes #33127", what: "The average=True branch treated an index equal to max_idx as past the end.", aiDisclosure: "I didn't use AI." };
    expect(byId(prChecks(full))).toEqual({ "pr-reference": true, "pr-what": true, "pr-ai": true });
    expect(prBody(full)).toContain("#### Reference Issues/PRs\nFixes #33127\n");
    expect(prBody(full)).toContain("#### AI usage disclosure\nI didn't use AI.\n");
  });
});

describe("changelogChecks", () => {
  it("passes every task's real fragment (from source.md)", () => {
    for (const { slug } of listTasks()) {
      const source = readFileSync(path.join(root, slug, "source.md"), "utf8");
      const fragment = /## The changelog entry[^\n]*\n[\s\S]*?```rst\n([\s\S]*?)\n```/.exec(source)![1];
      const coach = JSON.parse(readFileSync(path.join(root, slug, "coach.json"), "utf8")) as TaskCoach;
      expect(changelogChecks(fragment, coach.changelog.mentions).filter((r) => !r.ok).map((r) => r.id), slug).toEqual([]);
    }
  });

  it("catches a missing bullet, two bullets, no By :user: and no role", () => {
    expect(byId(changelogChecks("Fixed fetch_file.", ["fetch_file"]))).toEqual({ "fragment-bullet": false, "fragment-user": false, "fragment-role": false });
    expect(byId(changelogChecks("- :func:`datasets.fetch_file` now refuses paths.\n- also docs.\n  By :user:`Me <me>`.", ["fetch_file"]))["fragment-bullet"]).toBe(false);
    expect(byId(changelogChecks("- :func:`datasets.fetch_file` now refuses paths.\n  By :user:`Me <me>`.", ["fetch_file"]))).toEqual({
      "fragment-bullet": true,
      "fragment-user": true,
      "fragment-role": true,
    });
    expect(byId(changelogChecks("- fetch_file now refuses paths. By :user:`Me <me>`", ["fetch_file"]))["fragment-role"]).toBe(false);
  });

  it("names the fragment file like the README says", () => {
    expect(fragmentPath("sklearn.utils", "fix")).toBe("doc/whats_new/upcoming_changes/sklearn.utils/<PR number>.fix.rst");
  });
});

describe("looksLikeCommentedCode", () => {
  it.each([
    "# for zero weights, skip ahead:",
    "# if the next weight is 0, move on:",
    // Borderline, read as English: the right-hand side is two plain words.
    "# result = weighted value",
    "# return early when nothing is left",
    "# Handle case where there are trailing 0 sample weight samples",
    "# XXX: is this the most efficient way? memory-wise yes, cpu wise?",
  ])("English comment, not flagged: %s", (line) => expect(looksLikeCommentedCode(line)).toBe(false));

  it.each(["# print(next_index)", "#     next_index = percentile_indices[col_idx]", "# if next_index > max_idx:", "# for col_idx in zero_weight_cols:", "# return result", "# import pdb"])(
    "code, flagged: %s",
    (line) => expect(looksLikeCommentedCode(line)).toBe(true)
  );

  it("is worded as a question", () => {
    const t = getTask("weighted-percentile-zero-weight")!;
    const code = t.before.replace("if next_index >= max_idx:", "if next_index > max_idx:\n                    # next_index = 0");
    const r = codeChecks({ file: t.file, before: t.before, code, symbol: t.about.whereToLook.symbol, fixSize: t.fixSize, solved: true }).find((c) => c.id === "style-debug")!;
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/looks like commented-out code — is it\?$/);
  });
});

describe("By :user: with several authors", () => {
  it.each([
    ["- Fixed x.\n  By :user:`A <a>` and :user:`B <b>`.", true],
    ["- Fixed x.\n  By :user:`A <a>`, :user:`B <b>` and :user:`C <c>`.", true],
    ["- Fixed x.\n  By :user:`A <a>`, :user:`B <b>`, and :user:`C <c>`.", true],
    ["- Fixed x.\n  By A and B.", false],
  ])("%s → %s", (text, ok) => {
    expect(changelogChecks(text, ["x"]).find((c) => c.id === "fragment-user")!.ok).toBe(ok);
  });
});
