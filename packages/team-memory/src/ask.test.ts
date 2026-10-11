/**
 * Runs the documented command for real (`pnpm -s team:ask … --json` from the
 * repo root), so a pnpm banner on stdout or a broken root script is caught.
 * Slow-ish (each run starts pnpm and tsx), hence the long timeout.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "./corpus";

const root = findRepoRoot();
// When the tests themselves run under `pnpm -s test`, pnpm sets npm_config_reporter=silent, and the
// child pnpm would inherit it and act as if -s were given. Drop it so each case controls -s itself.
const { npm_config_reporter: _reporter, ...childEnv } = process.env;
const run = (args: string[], silent = true) =>
  spawnSync("pnpm", [...(silent ? ["-s"] : []), "team:ask", ...args], { cwd: root, encoding: "utf-8", env: childEnv });

describe("pnpm team:ask (the real command)", { timeout: 60_000 }, () => {
  it("--json prints only JSON, with passages for a question about our notes", () => {
    const r = run(["pyodide classic workers", "--json", "--limit", "2"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.label).toBe("closest");
    expect(out.results).toHaveLength(2);
    expect(out.results[0].excerpt[0]).toHaveProperty("line");
  });

  it("nothing related: JSON label and exit code 1", () => {
    const r = run(["zzqxv blorptangle", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ label: "nothing related", results: [] });
  });

  it("usage error: JSON error with exitCode 2 on stdout, message on stderr", () => {
    const r = run(["--json"]);
    // `pnpm -s` reports any failing script as 1; the JSON keeps the real code.
    expect(r.status).not.toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ error: "Missing question.", exitCode: 2 });
    expect(r.stderr).toContain("Usage: pnpm team:ask");
  });

  it("without -s, pnpm passes exit code 2 through", () => {
    expect(run(["--limit", "x"], false).status).toBe(2);
  });

  it("a leading -- still reads the flags after it", () => {
    const r = run(["--", "pyodide", "--json", "--limit", "1"]);
    expect(JSON.parse(r.stdout)).toMatchObject({ question: "pyodide", label: "closest" });
  });
});
