import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffSize, type SklearnSources, type SklearnTask } from "./taskRules";

const root = path.resolve(__dirname, "../../../../content/scikit-learn");
const sources = JSON.parse(readFileSync(path.join(root, "sources.json"), "utf8")) as SklearnSources;
const slugs = sources.tasks.map((t) => t.slug);

describe("scikit-learn content", () => {
  it("lists the 5 tasks in sources.json, and a folder exists for each and nothing else", () => {
    expect(slugs).toHaveLength(5);
    const folders = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(folders.sort()).toEqual([...slugs].sort());
    expect(readFileSync(path.join(root, "LICENSE"), "utf8")).toContain("BSD 3-Clause License");
  });

  it.each(slugs)("%s has a complete task.json pointing to files that exist", (slug) => {
    const dir = path.join(root, slug);
    const task = JSON.parse(readFileSync(path.join(dir, "task.json"), "utf8")) as SklearnTask;
    const entry = sources.tasks.find((t) => t.slug === slug)!;
    expect(task).toMatchObject({ slug, pr: entry.pr, mergeCommit: entry.mergeCommit, base: sources.base });
    expect(task.upstreamTitle).toContain(`(#${task.pr})`);
    expect(task.file).toMatch(/^sklearn\/.+\.py$/);
    expect(task.testFile).toMatch(/^sklearn\/(.+\/)?tests\/test_.+\.py$/);
    for (const f of [`before/${task.file}`, `solution/${task.file}`, `tests/${task.testFile}`, "fix.diff"]) {
      expect(existsSync(path.join(dir, f)), f).toBe(true);
    }
    expect(task.failToPass.length).toBeGreaterThan(0);
    const all = [...task.failToPass, ...task.passToPass];
    expect(new Set(all).size, "no test is in both lists").toBe(all.length);
    for (const id of all) expect(id.startsWith(`${task.testFile}::`), id).toBe(true);
    expect([...task.failToPass].sort()).toEqual(task.failToPass);
    expect([...task.passToPass].sort()).toEqual(task.passToPass);
    const diff = readFileSync(path.join(dir, "fix.diff"), "utf8");
    expect(diff.startsWith(`diff --git a/${task.file} b/${task.file}\n`)).toBe(true);
    expect(diffSize(diff)).toEqual(task.fixSize);
    expect(readFileSync(path.join(dir, "before", task.file), "utf8")).not.toBe(readFileSync(path.join(dir, "solution", task.file), "utf8"));
  });

  it("uses LF line endings everywhere", () => {
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => /\.(py|json|diff|md)$/.test(f));
    for (const f of files) expect(readFileSync(path.join(root, f), "utf8").includes("\r"), f).toBe(false);
  });
});
