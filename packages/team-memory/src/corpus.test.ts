import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot, loadCorpus, splitPassages } from "./corpus";

const FIXTURE = [
  "# Lessons", //                                   1
  "", //                                            2
  "Intro paragraph that", //                        3
  "spans two lines.", //                            4
  "", //                                            5
  "## Engineer", //                                 6
  "- **First lesson.** Short.", //                  7
  "- **Second lesson.** Starts here", //            8
  "  and continues on an indented line,", //        9
  "  - with a nested bullet that stays put.", //    10
  "1. A numbered item.", //                         11
].join("\n");

describe("splitPassages", () => {
  const passages = splitPassages("lessons/x.md", FIXTURE);
  const find = (s: string) => passages.find((p) => p.text.includes(s))!;

  it("gives a heading its own 1-based line", () => {
    expect(find("# Lessons")).toMatchObject({ startLine: 1, endLine: 1, heading: "Lessons" });
    expect(find("## Engineer")).toMatchObject({ startLine: 6, endLine: 6, heading: "Engineer" });
  });

  it("keeps a paragraph together with its line range and heading", () => {
    expect(find("Intro paragraph")).toMatchObject({
      file: "lessons/x.md",
      startLine: 3,
      endLine: 4,
      heading: "Lessons",
      text: "Intro paragraph that\nspans two lines.",
    });
  });

  it("splits at each top-level bullet, keeping indented continuations", () => {
    expect(find("First lesson")).toMatchObject({ startLine: 7, endLine: 7, heading: "Engineer" });
    const second = find("Second lesson");
    expect(second).toMatchObject({ startLine: 8, endLine: 10, heading: "Engineer" });
    expect(second.text).toContain("nested bullet");
    expect(find("numbered item")).toMatchObject({ startLine: 11, endLine: 11 });
    expect(passages).toHaveLength(6);
  });

  it("keeps fenced code whole and does not read `# comment` as a heading", () => {
    const text = ["## Try it", "```bash", "# install", "", "pnpm install", "```", "After."].join("\n");
    const ps = splitPassages("f.md", text);
    expect(ps.map((p) => [p.startLine, p.endLine, p.heading])).toEqual([
      [1, 1, "Try it"],
      [2, 7, "Try it"],
    ]);
  });

  it("treats an unclosed fence as plain text, so later headings still count", () => {
    const ps = splitPassages("f.md", ["# A", "```", "code", "", "## B", "text"].join("\n"));
    expect(ps.map((p) => [p.startLine, p.endLine, p.heading])).toEqual([
      [1, 1, "A"],
      [2, 3, "A"],
      [5, 5, "B"],
      [6, 6, "B"],
    ]);
  });

  it("does not open a fence on a line of inline triple-backtick code", () => {
    const ps = splitPassages("f.md", ["```js const x = 1```", "", "## Next"].join("\n"));
    expect(ps.map((p) => [p.startLine, p.heading])).toEqual([
      [1, ""],
      [3, "Next"],
    ]);
  });

  it("closes a fence only with the same character, at least as long", () => {
    const text = ["````", "~~~", "```", "# still code", "````", "## Out"].join("\n");
    expect(splitPassages("f.md", text).map((p) => [p.startLine, p.endLine])).toEqual([
      [1, 5],
      [6, 6],
    ]);
  });

  it("never puts endLine past the last line when the file ends with a newline", () => {
    for (const text of ["# A\n```\ncode\n", "# A\n```\ncode\n```\n", "- a\n  more\n"]) {
      const lineCount = text.split("\n").length - 1;
      for (const p of splitPassages("f.md", text)) expect(p.endLine).toBeLessThanOrEqual(lineCount);
    }
    expect(splitPassages("f.md", "# A\n```\ncode\n```\n").at(-1)).toMatchObject({ startLine: 2, endLine: 4 });
  });

  it("handles CRLF line endings", () => {
    const ps = splitPassages("f.md", "# A\r\n\r\n- b\r\n- c\r\n");
    expect(ps.map((p) => [p.text, p.startLine])).toEqual([
      ["# A", 1],
      ["- b", 3],
      ["- c", 4],
    ]);
  });

  it("makes each table row its own passage, skipping the |---| line", () => {
    const table = ["## Files", "Intro line.", "| File | Job |", "|---|:--:|", "| `a.md` | first |", "| `b.md` | second |", "After."].join("\n");
    expect(splitPassages("t.md", table).map((p) => [p.startLine, p.endLine, p.heading, p.text])).toEqual([
      [1, 1, "Files", "## Files"],
      [2, 2, "Files", "Intro line."],
      [3, 3, "Files", "| File | Job |"],
      [5, 5, "Files", "| `a.md` | first |"],
      [6, 6, "Files", "| `b.md` | second |"],
      [7, 7, "Files", "After."],
    ]);
  });

  it("keeps a table inside a code fence whole", () => {
    const text = ["```", "| a | b |", "|---|---|", "```"].join("\n");
    expect(splitPassages("t.md", text)).toHaveLength(1);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitPassages("f.md", "")).toEqual([]);
    expect(splitPassages("f.md", "  \n\t\n\n")).toEqual([]);
  });

  it("uses an empty heading before the first heading", () => {
    expect(splitPassages("f.md", "No heading yet.")[0]).toMatchObject({ heading: "", startLine: 1 });
  });
});

describe("loadCorpus (temporary folder)", () => {
  let tmp = "";
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("loads only .md files, including nested ones, and allows one missing memory folder", () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "team-memory-"));
    mkdirSync(path.join(tmp, ".claude/team/lessons"), { recursive: true });
    writeFileSync(path.join(tmp, ".claude/team/a.md"), "# A\n");
    writeFileSync(path.join(tmp, ".claude/team/b.txt"), "# not markdown\n");
    writeFileSync(path.join(tmp, ".claude/team/lessons/c.md"), "- lesson\n");
    // docs/build-log is deliberately missing.
    expect(loadCorpus(tmp).map((p) => `${p.file}:${p.startLine}`)).toEqual([
      ".claude/team/a.md:1",
      ".claude/team/lessons/c.md:1",
    ]);
  });

  it("throws when no memory folder exists, instead of returning an empty corpus", () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "team-memory-"));
    expect(() => loadCorpus(tmp)).toThrow(/No team memory found under/);
  });
});

describe("loadCorpus (real repo files)", () => {
  const root = findRepoRoot();
  const corpus = loadCorpus(root);

  it("finds the repo root and loads passages from the memory folders", () => {
    expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(true);
    expect(corpus.length).toBeGreaterThan(0);
    for (const p of corpus) {
      expect(p.file).toMatch(/^(\.claude\/team|docs\/build-log)\/.+\.md$/);
    }
  });

  it("every passage's text is exactly the file lines it cites", () => {
    const files = new Map<string, string[]>();
    for (const p of corpus) {
      if (!files.has(p.file)) files.set(p.file, readFileSync(path.join(root, p.file), "utf-8").split(/\r?\n/));
      expect(files.get(p.file)!.slice(p.startLine - 1, p.endLine).join("\n"), `${p.file}:${p.startLine}`).toBe(p.text);
    }
  });

  it("maps a real decisions.md heading to its true line number", () => {
    const file = ".claude/team/decisions.md";
    const lines = readFileSync(path.join(root, file), "utf-8").split(/\r?\n/);
    const idx = lines.findIndex((l) => l.startsWith("### "));
    expect(idx).toBeGreaterThanOrEqual(0);
    const passage = corpus.find((p) => p.file === file && p.text === lines[idx]);
    expect(passage).toMatchObject({ startLine: idx + 1, endLine: idx + 1 });
  });

  it("maps a real lessons bullet to its true line number", () => {
    const file = ".claude/team/lessons/engineer.md";
    const lines = readFileSync(path.join(root, file), "utf-8").split(/\r?\n/);
    const idx = lines.findIndex((l) => l.startsWith("- "));
    expect(idx).toBeGreaterThanOrEqual(0);
    const passage = corpus.find((p) => p.file === file && p.startLine === idx + 1);
    expect(passage?.text.split("\n")[0]).toBe(lines[idx]);
  });
});
