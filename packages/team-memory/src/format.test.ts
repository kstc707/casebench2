import { describe, expect, it } from "vitest";
import { parseAskArgs } from "./args";
import type { Passage } from "./corpus";
import { citation, excerpt, excerptText, exitCodeFor, formatHuman, formatJson, formatJsonError, toJsonOutput } from "./format";
import { MAX_QUERY_CHARS, stem, type SearchResponse } from "./search";

const passage = (over: Partial<Passage> = {}): Passage => ({
  file: ".claude/team/decisions.md",
  startLine: 10,
  endLine: 12,
  heading: "Search",
  text: "- Two honest labels.\n  Never claim the answer.\n  Third line.",
  ...over,
});

const response = (over: Partial<SearchResponse> = {}): SearchResponse => ({
  label: "closest",
  results: [{ passage: passage(), score: 3.14159, matched: ["label", "honest→honesti"] }],
  coverage: 0.8,
  knownShare: 1,
  lowOverlap: false,
  unknownTerms: [],
  truncated: false,
  ...over,
});

const meta = { question: "how do labels work", passageCount: 42 };
const HEADER = "Closest passages in the team's notes — check whether they answer your question:";
const FOOTER =
  "Searched 42 passages in .claude/team and docs/build-log. Keyword search only — it finds passages, it doesn't decide the answer.";

describe("formatHuman", () => {
  it("closest: header, numbered citation with heading, excerpt of the passage text, footer", () => {
    const out = formatHuman(response(), meta);
    expect(out).toBe(
      [
        HEADER,
        "",
        "1. .claude/team/decisions.md:10-12  (Search)",
        "     10│ - Two honest labels.",
        "     11│   Never claim the answer.",
        "     12│   Third line.",
        "",
        FOOTER,
        "",
      ].join("\n")
    );
    expect(out).not.toContain("honesti"); // stems from `matched` never shown
    expect(out).not.toContain("⚠");
  });

  it("closest + lowOverlap: warns before the passages, naming the unknown words", () => {
    const out = formatHuman(response({ lowOverlap: true, knownShare: 0.3, unknownTerms: ["ditch", "kubernetes"] }), meta);
    const warning = "⚠ These words don't appear in the team's notes: ditch, kubernetes. The passages may be unrelated.";
    expect(out).toContain(warning);
    expect(out.indexOf(warning)).toBeLessThan(out.indexOf(HEADER));
    expect(out).not.toContain("Note: not found");
  });

  it("unknown words without lowOverlap get a softer note", () => {
    const out = formatHuman(response({ unknownTerms: ["ditch"] }), meta);
    expect(out).toContain("Note: not found in the notes: ditch.");
    expect(out).not.toContain("⚠");
  });

  it("truncated: says the question was cut", () => {
    const out = formatHuman(response({ truncated: true }), meta);
    expect(out).toContain(`cut to its first ${MAX_QUERY_CHARS} characters`);
  });

  it("nothing related: no header, no list", () => {
    const out = formatHuman(response({ label: "nothing related", results: [], coverage: 0, knownShare: 0 }), meta);
    expect(out).toBe(["Nothing related found in the team's notes (.claude/team, docs/build-log).", "", FOOTER, ""].join("\n"));
    expect(out).not.toContain("Closest");
  });

  it("limit 0: never prints the header over an empty list", () => {
    const out = formatHuman(response({ results: [] }), meta);
    expect(out).toContain("No passages requested (--limit 0)");
    expect(out).not.toContain(HEADER);
  });

  it("single-line range and missing heading", () => {
    const out = formatHuman(response({ results: [{ passage: passage({ startLine: 7, endLine: 7, heading: "", text: "One line." }), score: 1, matched: [] }] }), meta);
    expect(out).toContain("1. .claude/team/decisions.md:7\n");
    expect(out).not.toContain("()");
  });

  it("does not repeat the heading for a passage that is the heading line itself", () => {
    const out = formatHuman(response({ results: [{ passage: passage({ startLine: 4, endLine: 4, heading: "Search", text: "## Search" }), score: 1, matched: ["search"] }] }), meta);
    expect(out).toContain("1. .claude/team/decisions.md:4\n     4│ ## Search\n");
    expect(out).not.toContain("(Search)");
  });

  it("numbers several results in order", () => {
    const results = [1, 2, 3].map((n) => ({ passage: passage({ startLine: n, endLine: n, text: `line ${n}` }), score: 4 - n, matched: [] }));
    const out = formatHuman(response({ results }), meta);
    expect(out.indexOf("1. .claude/team/decisions.md:1 ")).toBeLessThan(out.indexOf("2. .claude/team/decisions.md:2 "));
    expect(out).toContain("3. .claude/team/decisions.md:3  (Search)");
  });

  it("never calls a result an answer", () => {
    for (const r of [response(), response({ lowOverlap: true, unknownTerms: ["x"] }), response({ label: "nothing related", results: [] })]) {
      // The only "answer"s allowed are in the fixed header and footer, which tell the reader to judge.
      const rest = formatHuman(r, meta).replace(HEADER, "").replace(FOOTER, "").replace("Never claim the answer.", "");
      expect(rest.toLowerCase()).not.toContain("answer");
    }
  });
});

describe("excerpt", () => {
  // `matched` holds search terms (stems), as search() returns them.
  const PY = stem("pyodide");
  const long = passage({
    startLine: 50,
    endLine: 57,
    text: ["| Agent | Job |", "| a | one |", "| b | two |", "| c | pyodide here |", "| d | four |", "| e | five |", "| f | worker and pyodide |", "| g | seven |"].join("\n"),
  });

  it("shows the lines holding matched terms, in file order, with real line numbers", () => {
    expect(excerpt(long, [PY, stem("worker")])).toEqual([
      { line: 53, text: "| c | pyodide here |" },
      { line: 56, text: "| f | worker and pyodide |" },
    ]);
  });

  it("maps a synonym match (typed→synonym) to the synonym the passage holds", () => {
    expect(excerpt(long, [`loop→${stem("worker")}`]).map((l) => l.line)).toEqual([56]);
  });

  it("keeps at most 3 lines, preferring lines with more matched terms", () => {
    const p = passage({ startLine: 1, endLine: 5, text: "cat\ncat\ncat dog\ncat\ncat dog" });
    expect(excerpt(p, ["cat", "dog"]).map((l) => l.line)).toEqual([1, 3, 5]);
  });

  it("falls back to the first lines when no line holds a matched term", () => {
    expect(excerpt(long, ["nowhere"]).map((l) => l.line)).toEqual([50, 51, 52]);
  });

  it("shows a short passage whole", () => {
    expect(excerpt(passage(), ["third"]).map((l) => l.line)).toEqual([10, 11, 12]);
  });

  it("marks left-out lines with … rows (before, between, after)", () => {
    expect(excerptText(long, excerpt(long, [PY]))).toEqual([
      "      …│",
      "     53│ | c | pyodide here |",
      "      …│",
      "     56│ | f | worker and pyodide |",
      "      …│",
    ]);
  });

  it("cuts long lines to 120 characters with …", () => {
    const one = (text: string, matched: string[] = []) => excerpt(passage({ startLine: 1, endLine: 1, text }), matched)[0].text;
    expect(one("x".repeat(200))).toBe("x".repeat(120) + "…");
    expect(one("y".repeat(120))).toBe("y".repeat(120));
  });

  it("moves the window to a matched word that would be cut off", () => {
    const text = "filler ".repeat(30) + "pyodide " + "tail ".repeat(30);
    const [line] = excerpt(passage({ startLine: 1, endLine: 1, text }), [PY]);
    expect(line.text.startsWith("…")).toBe(true);
    expect(line.text.endsWith("…")).toBe(true);
    expect(line.text).toContain("pyodide");
    expect(text).toContain(line.text.slice(1, -1)); // still the file's own text
  });

  it("shows every matched word on a long line when they fit in the window", () => {
    const text = "cat " + "filler ".repeat(15) + "dog " + "tail ".repeat(30);
    const [line] = excerpt(passage({ startLine: 1, endLine: 1, text }), ["cat", "dog"]);
    expect(line.text.startsWith("cat")).toBe(true);
    const late = "filler ".repeat(12) + "cat " + "filler ".repeat(8) + "dog " + "tail ".repeat(30);
    const [moved] = excerpt(passage({ startLine: 1, endLine: 1, text: late }), ["cat", "dog"]);
    expect(moved.text).toMatch(/^….*cat.*dog.*…$/);
  });

  it("counts characters, not UTF-16 units, so emoji are not split", () => {
    const [line] = excerpt(passage({ startLine: 1, endLine: 1, text: "😀".repeat(130) }), []);
    expect(Array.from(line.text)).toHaveLength(121);
    expect(line.text.endsWith("😀…")).toBe(true);
  });

  it("keeps the passage's own text (leading indent kept, trailing spaces dropped)", () => {
    expect(excerpt(passage({ startLine: 1, endLine: 2, text: "- item   \n  continued" }), []).map((l) => l.text)).toEqual(["- item", "  continued"]);
  });
});

describe("citation", () => {
  it("one line or a range", () => {
    expect(citation("a.md", 3, 3)).toBe("a.md:3");
    expect(citation("a.md", 3, 5)).toBe("a.md:3-5");
  });
});

describe("formatJson", () => {
  it("has the documented shape, rounded scores, and no stems", () => {
    const out = formatJson(response({ unknownTerms: ["ditch"] }), meta);
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      question: "how do labels work",
      label: "closest",
      lowOverlap: false,
      unknownTerms: ["ditch"],
      truncated: false,
      results: [
        {
          file: ".claude/team/decisions.md",
          startLine: 10,
          endLine: 12,
          heading: "Search",
          score: 3.14,
          excerpt: [
            { line: 10, text: "- Two honest labels." },
            { line: 11, text: "  Never claim the answer." },
            { line: 12, text: "  Third line." },
          ],
        },
      ],
    });
    expect(out).not.toContain("matched");
    expect(out).not.toContain("honesti");
  });

  it("nothing related: empty results", () => {
    expect(toJsonOutput(response({ label: "nothing related", results: [] }), meta).results).toEqual([]);
  });

  it("errors are JSON too", () => {
    expect(JSON.parse(formatJsonError("Missing question.", 2))).toEqual({ error: "Missing question.", exitCode: 2 });
  });
});

describe("exitCodeFor", () => {
  it("0 for closest (even with --limit 0), 1 for nothing related", () => {
    expect(exitCodeFor(response())).toBe(0);
    expect(exitCodeFor(response({ results: [] }))).toBe(0);
    expect(exitCodeFor(response({ label: "nothing related", results: [] }))).toBe(1);
  });
});

describe("parseAskArgs", () => {
  it("question with defaults", () => {
    expect(parseAskArgs(["why pnpm"])).toEqual({ kind: "ask", question: "why pnpm", limit: 3, json: false });
  });

  it("joins unquoted words and accepts flags anywhere", () => {
    expect(parseAskArgs(["--json", "why", "pnpm", "--limit", "5"])).toEqual({ kind: "ask", question: "why pnpm", limit: 5, json: true });
  });

  it("--limit=N and --limit 0", () => {
    expect(parseAskArgs(["q", "--limit=7"])).toMatchObject({ limit: 7 });
    expect(parseAskArgs(["q", "--limit", "0"])).toMatchObject({ kind: "ask", limit: 0 });
  });

  it("drops a leading -- (the pnpm habit) and still reads flags after it", () => {
    expect(parseAskArgs(["--", "why", "pnpm", "--json"])).toEqual({ kind: "ask", question: "why pnpm", limit: 3, json: true });
  });

  it("a later -- makes everything after it question text", () => {
    expect(parseAskArgs(["--json", "--", "-x", "--limit"])).toEqual({ kind: "ask", question: "-x --limit", limit: 3, json: true });
    expect(parseAskArgs(["--", "--", "--json"])).toEqual({ kind: "ask", question: "--json", limit: 3, json: false });
  });

  it("an error still reports --json given later, so it can be printed as JSON", () => {
    expect(parseAskArgs(["q", "--bogus", "--json"])).toEqual({ kind: "error", message: "Unknown option: --bogus", json: true });
    expect(parseAskArgs(["--json"])).toEqual({ kind: "error", message: "Missing question.", json: true });
    expect(parseAskArgs([])).toMatchObject({ kind: "error", json: false });
  });

  it.each([
    [[], "Missing question"],
    [["   "], "Missing question"],
    [["--json"], "Missing question"],
    [["q", "--limit"], "--limit needs a number"],
    [["q", "--limit", "-1"], "whole number"],
    [["q", "--limit", "2.5"], "whole number"],
    [["q", "--limit=abc"], "whole number"],
    [["q", "--limit="], "whole number"],
    [["q", "--verbose"], "Unknown option: --verbose"],
    [["q", "-n", "3"], "Unknown option: -n"],
  ])("%j is a usage error (%s)", (argv, message) => {
    const parsed = parseAskArgs(argv as string[]);
    expect(parsed.kind).toBe("error");
    expect(parsed.kind === "error" && parsed.message).toContain(message);
  });

  it("--help", () => {
    expect(parseAskArgs(["q", "--help"])).toEqual({ kind: "help" });
  });
});
