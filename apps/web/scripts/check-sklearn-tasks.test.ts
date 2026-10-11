import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Runs the real checker (as CI does) on a one-task copy of the content: green when the copy is intact,
// red when task.json is broken. So a checker that always passes, or always fails, can't go unnoticed.
// Needs Pyodide, so it runs with `pnpm test:pyodide`.
const web = path.resolve(__dirname, "..");
const content = path.resolve(web, "../../content/scikit-learn");
const SLUG = "weighted-percentile-zero-weight";
const tmp = mkdtempSync(path.join(os.tmpdir(), "check-tasks-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function copyWith(name: string, edit?: (task: Record<string, string[]>) => void): string {
  const dir = path.join(tmp, name);
  cpSync(path.join(content, SLUG), path.join(dir, SLUG), { recursive: true });
  const sources = JSON.parse(readFileSync(path.join(content, "sources.json"), "utf8"));
  sources.tasks = sources.tasks.filter((t: { slug: string }) => t.slug === SLUG);
  writeFileSync(path.join(dir, "sources.json"), JSON.stringify(sources));
  if (edit) {
    const file = path.join(dir, SLUG, "task.json");
    const task = JSON.parse(readFileSync(file, "utf8"));
    edit(task);
    writeFileSync(file, JSON.stringify(task));
  }
  return dir;
}

function check(dir: string) {
  const r = spawnSync(path.join(web, "node_modules/.bin/tsx"), ["scripts/check-sklearn-tasks.ts", "--content", dir], { cwd: web, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

describe.skipIf(!process.env.RUN_PYODIDE_TESTS)("check-sklearn-tasks (the real script, on one task)", () => {
  it("passes an intact task", { timeout: 240_000 }, () => {
    const r = check(copyWith("good"));
    expect(r.out).toContain("1 of 1 tasks OK");
    expect(r.status).toBe(0);
  });

  it("fails, with exit code 1, when a passToPass test is recorded as failToPass", { timeout: 240_000 }, () => {
    const r = check(copyWith("broken", (t) => t.failToPass.push(t.passToPass.shift()!)));
    expect(r.out).toContain(`FAIL ${SLUG}`);
    expect(r.out).toContain("aren't failToPass now");
    expect(r.out).toContain("0 of 1 tasks OK");
    expect(r.status).toBe(1);
  });
});
