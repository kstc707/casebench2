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

describe.each(sources.tasks.map((t) => t.slug))("%s about.json", (slug) => {
  const about = JSON.parse(readFileSync(path.join(root, slug, "about.json"), "utf8")) as About;
  const source = readFileSync(path.join(root, slug, "source.md"), "utf8");
  const task = JSON.parse(readFileSync(path.join(root, slug, "task.json"), "utf8")) as SklearnTask;

  it("is complete", () => {
    for (const k of ["title", "teaches", "summary"] as const) expect(about[k].trim().length, k).toBeGreaterThan(10);
    expect(about.quotes.length).toBeGreaterThan(0);
    expect(about.pr).toEqual({ number: task.pr, url: `${REPO}pull/${task.pr}` });
  });

  it("quotes only text found word for word in source.md", () => {
    for (const q of about.quotes) {
      expect(q.text.length).toBeGreaterThan(10);
      expect(squash(source), q.text).toContain(squash(q.text));
    }
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
