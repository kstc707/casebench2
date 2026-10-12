import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SklearnSources } from "../sklearn/taskRules";
import type { TaskCoach } from "./types";

const root = path.resolve(__dirname, "../../../../content/scikit-learn");
const sources = JSON.parse(readFileSync(path.join(root, "sources.json"), "utf8")) as SklearnSources;
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const folders = JSON.parse(readFileSync(path.join(root, "contributing/changelog-folders.json"), "utf8")) as string[];

describe("contributing docs", () => {
  it("are copied with their source recorded", () => {
    for (const f of ["PULL_REQUEST_TEMPLATE.md", "upcoming_changes-README.md", "contributing.rst", "CONTRIBUTING.md", "pyproject.toml"]) {
      expect(existsSync(path.join(root, "contributing", f)), f).toBe(true);
    }
    const source = readFileSync(path.join(root, "contributing/SOURCE.md"), "utf8");
    expect(source).toMatch(/commit\s+`[0-9a-f]{40}`/);
    expect(readFileSync(path.join(root, "contributing/pyproject.toml"), "utf8")).toContain("line-length = 88");
    expect(folders).toContain("sklearn.utils");
  });
});

describe.each(sources.tasks.map((t) => t.slug))("%s coach.json", (slug) => {
  const coach = JSON.parse(readFileSync(path.join(root, slug, "coach.json"), "utf8")) as TaskCoach;
  const source = readFileSync(path.join(root, slug, "source.md"), "utf8");
  const task = JSON.parse(readFileSync(path.join(root, slug, "task.json"), "utf8")) as { file: string; pr: number };

  it("has 3 questions, each with at least 2 key points, with unique ids", () => {
    expect(coach.questions).toHaveLength(3);
    expect(new Set(coach.questions.map((q) => q.id)).size).toBe(3);
    for (const q of coach.questions) {
      expect(q.prompt.length).toBeGreaterThan(15);
      expect(q.points.length).toBeGreaterThanOrEqual(2);
      expect(new Set(q.points.map((p) => p.id)).size).toBe(q.points.length);
    }
  });

  it("traces every key point to real text in source.md, fix.diff, tests.diff, the before file or the contributing docs", () => {
    const allowed = new Set(["source.md", "fix.diff", "tests.diff", `before/${task.file}`]);
    for (const q of coach.questions) {
      for (const p of q.points) {
        const f = p.evidence.file;
        expect(allowed.has(f) || f.startsWith("contributing/"), `${q.id}.${p.id}: ${f}`).toBe(true);
        const file = f.startsWith("contributing/") ? path.join(root, f) : path.join(root, slug, f);
        expect(squash(readFileSync(file, "utf8")), `${q.id}.${p.id}: "${p.evidence.quote}" in ${f}`).toContain(squash(p.evidence.quote));
      }
    }
  });

  it("puts the changelog fragment where the real fix put it", () => {
    const real = new RegExp(`doc/whats_new/upcoming_changes/([^/]+)/${task.pr}\\.([a-z-]+)\\.rst`).exec(source);
    expect(real, "source.md names the real fragment").not.toBeNull();
    expect(coach.changelog.folder).toBe(real![1]);
    expect(coach.changelog.type).toBe(real![2]);
    expect(folders).toContain(coach.changelog.folder);
    const fragment = source.slice(source.indexOf("## The changelog entry"));
    for (const m of coach.changelog.mentions) expect(fragment, m).toContain(m);
  });
});
