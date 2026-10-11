import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SklearnSources, SklearnTask } from "./taskRules";

/** content/scikit-learn/<slug>/about.json: written by hand, checked against source.md. */
interface About {
  title: string;
  teaches: string;
  summary: string;
  quotes: Array<{ text: string; source: string; url: string }>;
  whereToLook: { file: string; symbol: string; hint: string };
  pr: { number: number; url: string };
  issue: { number: number; url: string; fetched: boolean } | null;
}

const root = path.resolve(__dirname, "../../../../content/scikit-learn");
const sources = JSON.parse(readFileSync(path.join(root, "sources.json"), "utf8")) as SklearnSources;
const REPO = "https://github.com/scikit-learn/scikit-learn/";
// Quotes may wrap differently from the source (rst and docstrings break lines), so compare with runs of
// whitespace collapsed; every word and character must still be there, in order.
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** source.md split into its "## " sections: heading -> body. */
function sections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  let heading = "";
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) heading = line.slice(3);
    else out.set(heading, (out.get(heading) ?? "") + line + "\n");
  }
  return out;
}

/** The text inside a section's first fenced code block. */
const fenced = (body: string) => /```[a-z]*\n([\s\S]*?)\n```/.exec(body)?.[1] ?? "";

/** Which source.md section a quote's `source` label must come from. */
const SECTION_FOR: Record<string, string> = {
  "commit message": "The merge commit message",
  "changelog entry": "The changelog entry",
  "the test the fix added": "The test changes in the fix",
};

/** Every docstring in a Python file, as Python's ast reads it (system Python; no packages needed). */
function docstrings(file: string): string[] {
  const script = `
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
nodes = [tree] + [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
print(json.dumps([d for d in (ast.get_docstring(n) for n in nodes) if d]))`;
  return JSON.parse(execFileSync("python3", ["-I", "-B", "-c", script, file], { encoding: "utf8" })) as string[];
}

describe.each(sources.tasks.map((t) => t.slug))("%s about.json", (slug) => {
  const about = JSON.parse(readFileSync(path.join(root, slug, "about.json"), "utf8")) as About;
  const source = readFileSync(path.join(root, slug, "source.md"), "utf8");
  const task = JSON.parse(readFileSync(path.join(root, slug, "task.json"), "utf8")) as SklearnTask;

  it("is complete", () => {
    for (const k of ["title", "teaches", "summary"] as const) expect(about[k].trim().length, k).toBeGreaterThan(10);
    expect(about.quotes.length).toBeGreaterThan(0);
    expect(about.pr).toEqual({ number: task.pr, url: `${REPO}pull/${task.pr}` });
  });

  it("quotes only text found word for word in the source.md section its label names", () => {
    const parts = sections(source);
    for (const q of about.quotes) {
      expect(q.text.length).toBeGreaterThan(10);
      const want = SECTION_FOR[q.source];
      expect(want, `unknown quote source "${q.source}"`).toBeDefined();
      const body = [...parts].filter(([h]) => h.startsWith(want)).map(([, b]) => b).join("\n");
      expect(squash(body), `${q.text} (in "${want}")`).toContain(squash(q.text));
    }
  });

  it("shows test lines that really are in the task's test file", () => {
    const diff = fenced([...sections(source)].find(([h]) => h.startsWith("The test changes in the fix"))?.[1] ?? "");
    const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
    expect(added.length).toBeGreaterThan(0);
    const testLines = new Set(readFileSync(path.join(root, slug, "tests", task.testFile), "utf8").split("\n"));
    for (const l of added) expect(testLines.has(l), l).toBe(true);
  });

  it("shows the same test changes as tests.diff (the diff the checker verifies)", () => {
    const changed = (diff: string) => diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
    const shown = fenced([...sections(source)].find(([h]) => h.startsWith("The test changes in the fix"))?.[1] ?? "");
    const real = readFileSync(path.join(root, slug, "tests.diff"), "utf8");
    expect(changed(shown).length).toBeGreaterThan(0);
    expect(changed(shown)).toEqual(changed(real));
  });

  it("shows docstrings that really are in the student's before file", () => {
    const blocks = [...sections(source)].filter(([h]) => h.startsWith("Docstring of")).map(([, b]) => fenced(b));
    expect(blocks.length).toBeGreaterThan(0);
    const real = docstrings(path.join(root, slug, "before", task.file));
    for (const d of blocks) expect(real, d.slice(0, 60)).toContain(d);
  });

  it("records how and when it was made", () => {
    expect(source).toMatch(/Made on \d{4}-\d{2}-\d{2} by `python3 -I apps\/web\/scripts\/make-sklearn-sources\.py /);
  });

  it("links only to github.com/scikit-learn/scikit-learn, and every link is in source.md", () => {
    const urls = [about.pr.url, ...about.quotes.map((q) => q.url), ...(about.issue ? [about.issue.url] : [])];
    for (const u of urls) {
      expect(u.startsWith(REPO), u).toBe(true);
      expect(source, u).toContain(u);
    }
  });

  it("says what couldn't be fetched, and quotes nothing from an issue it couldn't fetch", () => {
    expect(source).toContain("## What could not be fetched");
    if (about.issue && !about.issue.fetched) {
      for (const q of about.quotes) expect(q.source).not.toMatch(/issue/i);
    }
  });

  it("points to a function or class that exists in the file the student edits", () => {
    expect(about.whereToLook.file).toBe(task.file);
    const before = readFileSync(path.join(root, slug, "before", task.file), "utf8");
    for (const name of about.whereToLook.symbol.split(".")) {
      expect(before, name).toMatch(new RegExp(`^\\s*(def|class) ${name}\\b`, "m"));
    }
  });
});
