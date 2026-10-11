import { describe, expect, it } from "vitest";
import { loadCorpus, splitPassages } from "./corpus";
import { buildIndex, MAX_QUERY_CHARS, normalizeTerm, search, stem, tokenize } from "./search";

// A small memory: each top-level bullet becomes its own passage.
const FIXTURE = [
  "# Notes", //                                                                        1
  "- **Practice mode shipped in PR #8.** Tests run in the browser.", //                 2
  "- PR #80 changed the colours of the landing page.", //                              3
  "- We counted 8 tasks in the first spike.", //                                       4
  "- `anthropicProvider.ts` drops the usage field, so tokens can't be counted.", //    5
  "- The provider for OpenAI lives in another file.", //                               6
  "- A run that takes over 60 s (an infinite loop) is stopped.", //                    7
  "- The event loop of the web page stays responsive.", //                             8
  "- Pyodide refuses classic workers.", //                                             9
  "- Pyodide is Python compiled for the browser, and it is loaded once, and it is cached, and the page shows a progress bar while it loads.", // 10
].join("\n");
const passages = splitPassages("fixture.md", FIXTURE);
const index = buildIndex(passages);
const topLine = (query: string) => search(index, query).results[0]?.passage.startLine;

describe("stem", () => {
  it.each([
    ["notes", "note"], // not "not"
    ["note", "note"],
    ["crashes", "crash"],
    ["crashed", "crash"],
    ["queries", "query"],
    ["tests", "test"],
    ["testing", "test"],
    ["running", "run"],
    ["making", "make"],
    ["status", "status"],
    ["analysis", "analysis"],
    ["thing", "thing"],
    ["need", "need"],
    ["one", "one"],
    ["nightly", "night"],
    ["family", "family"],
    ["used", "use"],
    ["uses", "use"],
    ["using", "use"],
    ["added", "add"],
    ["agreed", "agree"],
    ["agree", "agree"],
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
  ])("%s → %s", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it("gives different forms of a word the same stem", () => {
    expect(stem("provided")).toBe(stem("provide"));
    expect(stem("closed")).toBe(stem("close"));
    expect(stem("downloading")).toBe(stem("download"));
    expect(stem("faked")).toBe(stem("fake"));
  });
});

describe("tokenize", () => {
  it("drops stop words, lowercases and stems", () => {
    expect(tokenize("What are the Notes about Crashes?")).toEqual(["note", "crash"]);
  });

  it("keeps PR numbers and file names whole as well as in parts", () => {
    expect(tokenize("PR #8")).toEqual(["pr", "#8", "8"]);
    expect(tokenize("see `anthropicProvider.ts`.")).toEqual(["see", "anthropicprovider.ts", "anthropicprovider", "ts"]);
    expect(tokenize("one-on-one chats")).toEqual(["one-on-one", "one", "one", "chat"]);
  });

  it("does not make a heading's # marks into a term", () => {
    expect(tokenize("## Known limit")).toEqual(["known", "limit"]);
  });

  it("returns nothing for stop words and punctuation only", () => {
    expect(tokenize("what is it? -- ...")).toEqual([]);
  });
});

describe("search ranking", () => {
  it("finds an exact PR number, not a longer number or the bare digit", () => {
    expect(topLine("PR #8")).toBe(2);
    expect(topLine("#80")).toBe(3);
  });

  it("finds an exact file name above passages that share only part of it", () => {
    expect(topLine("anthropicProvider.ts")).toBe(5);
  });

  it("matches word forms through stemming", () => {
    expect(topLine("which test runs")).toBe(2); // "Tests run"
  });

  it("expands a query word to its synonyms", () => {
    const r = search(index, "endless loop");
    expect(r.results[0].passage.startLine).toBe(7);
    expect(r.results[0].matched).toEqual([`endless→${stem("infinite")}`, "loop"]);
  });

  it("scores a synonym a little lower than the word itself", () => {
    const [byWord, bySynonym] = [search(index, "infinite"), search(index, "endless")];
    expect(bySynonym.results[0].passage.startLine).toBe(7);
    expect(bySynonym.results[0].score).toBeLessThan(byWord.results[0].score);
  });

  it("ranks a short passage above a long one with the same match", () => {
    // Both mention Pyodide once; line 9 is much shorter than line 10.
    expect(search(index, "pyodide").results.map((r) => r.passage.startLine)).toEqual([9, 10]);
  });

  it("ranks a passage with a rare word above one with only a common word", () => {
    // "page" is in three passages, "infinite" in one.
    expect(topLine("infinite page")).toBe(7);
  });

  it("returns at most `limit` results, highest score first", () => {
    const r = search(index, "pyodide browser page", 2);
    expect(r.results).toHaveLength(2);
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.results[1].score);
  });

  it("is deterministic and breaks ties by file and line", () => {
    const twin = buildIndex([
      { file: "b.md", startLine: 1, endLine: 1, heading: "", text: "pyodide cache" },
      { file: "a.md", startLine: 9, endLine: 9, heading: "", text: "pyodide cache" },
      { file: "a.md", startLine: 2, endLine: 2, heading: "", text: "pyodide cache" },
    ]);
    const first = search(twin, "pyodide cache");
    expect(first.results.map((r) => `${r.passage.file}:${r.passage.startLine}`)).toEqual(["a.md:2", "a.md:9", "b.md:1"]);
    expect(search(twin, "pyodide cache")).toEqual(first);
  });
});

describe("search labels", () => {
  it("says nothing related, with no results, for nonsense", () => {
    expect(search(index, "asdfgh qwerty zxcvb")).toEqual({
      label: "nothing related",
      results: [],
      coverage: 0,
      knownShare: 0,
      lowOverlap: false, // no warning over an empty answer
      unknownTerms: ["asdfgh", "qwerty", "zxcvb"],
      truncated: false,
    });
  });

  it("says nothing related for an empty or stop-word-only query", () => {
    expect(search(index, "").label).toBe("nothing related");
    expect(search(index, "what is it?").label).toBe("nothing related");
    expect(search(index, "what is it?").lowOverlap).toBe(false);
  });

  it("still shows passages when important words are unknown, but flags low overlap and names the words", () => {
    // "page" is in the memory; "kubernetes", "cluster" and "backups" are not.
    const r = search(index, "which kubernetes cluster backups the page");
    expect(r.label).toBe("closest");
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.lowOverlap).toBe(true);
    expect(r.unknownTerms).toEqual(["kubernetes", "cluster", "backups"]);
  });

  it("does not hide a matching passage because one casual word is unknown", () => {
    const r = search(index, "whats the deal with pyodide");
    expect(r.label).toBe("closest");
    expect(r.results[0].passage.startLine).toBe(9);
    expect(r.unknownTerms).toEqual(["whats", "deal"]);
  });

  it("does not flag low overlap when the question's words are in the memory", () => {
    const r = search(index, "infinite loop");
    expect(r.lowOverlap).toBe(false);
    expect(r.unknownTerms).toEqual([]);
  });

  it("names the unknown part of a compound and doesn't count the compound as known", () => {
    const hyphen = search(index, "kubernetes-loop page");
    const spaced = search(index, "kubernetes loop page");
    expect(hyphen.unknownTerms).toEqual(["kubernetes"]);
    expect(hyphen.knownShare).toBeCloseTo(spaced.knownShare);
  });

  it("keeps the label about the question even when limit is 0", () => {
    const r = search(index, "pyodide", 0);
    expect(r.label).toBe("closest");
    expect(r.results).toEqual([]);
  });

  it("says closest, never more, when the words match", () => {
    expect(search(index, "pyodide").label).toBe("closest");
    expect(search(index, "PR #8").label).toBe("closest");
  });
});

describe("one query idea counts once", () => {
  it("scores a compound once, not once for the whole word and again for each part", () => {
    const memory = buildIndex(splitPassages("x.md", "- A Slack-style workspace.\n- Something else entirely."));
    const top = (q: string) => search(memory, q).results[0];
    // Whole word + each part would be 3 matches; it's the parts once (they beat the whole here).
    expect(top("slack-style").matched).toEqual(["slack", "style"]);
    expect(top("slack-style").score).toBeCloseTo(top("slack").score + top("style").score);
  });

  it("ranks a long passage with the exact file name above a short one sharing only its extension", () => {
    const memory = buildIndex(
      splitPassages(
        "x.md",
        [
          "- Edit utils.ts.",
          "- Edit index.ts.",
          "- The provider code lives in `anthropicProvider.ts`, which reads the key, builds the request, retries on errors and parses the reply into our own types.",
        ].join("\n")
      )
    );
    const r = search(memory, "anthropicProvider.ts");
    expect(r.results[0].passage.startLine).toBe(3);
  });

  it("ranks the passage matching every part of a path above passages matching one part", () => {
    const memory = buildIndex(
      splitPassages(
        "x.md",
        [
          "- Our apps folder.",
          "- Web things.",
          "- Scripts run nightly.",
          "- See scripts/practice-worker.mjs in apps/web for the worker.",
        ].join("\n")
      )
    );
    const r = search(memory, "apps/web/scripts/practice-worker.mjs", 4);
    expect(r.results[0].passage.startLine).toBe(4);
    expect(r.results[0].score).toBeGreaterThan(2 * r.results[1].score);
  });

  it("keeps two file names in one query as two ideas, even though both end in .ts", () => {
    const memory = buildIndex(
      splitPassages("x.md", ["- Compare `alphaReader.ts` with `betaWriter.ts`.", "- Only `alphaReader.ts` here.", "- Only `betaWriter.ts` here."].join("\n"))
    );
    const both = search(memory, "alphaReader.ts betaWriter.ts");
    expect(both.results[0].passage.startLine).toBe(1);
    expect(both.results[0].score).toBeGreaterThan(search(memory, "alphaReader.ts").results[0].score);
    expect(both.results[0].score).toBeGreaterThan(search(memory, "betaWriter.ts").results[0].score);
  });

  it("lets a full path also match a passage that names only its file", () => {
    const memory = buildIndex(
      splitPassages(
        "x.md",
        [
          "- `alphaReader.ts` drops the usage field.",
          "- The src folder of packages holds many things.",
          "- packages/ai/src has other files.",
          "- More src notes in packages.",
        ].join("\n")
      )
    );
    const r = search(memory, "packages/ai/src/alphaReader.ts", 4);
    expect(r.results[0].passage.startLine).toBe(1);
  });

  it("counts a word repeated inside one compound once", () => {
    const memory = buildIndex(splitPassages("x.md", "- one thing here.\n- Other notes."));
    expect(search(memory, "one-on-one").results[0].score).toBeCloseTo(search(memory, "one").results[0].score);
  });

  it("counts typed words from one synonym group once", () => {
    const memory = buildIndex(splitPassages("x.md", "- The nightly and daily journal job.\n- Other notes."));
    const score = (q: string) => search(memory, q).results[0].score;
    const r = search(memory, "nightly daily journal");
    expect(r.results[0].matched).toHaveLength(2); // the nightly/daily idea + "journal"
    expect(score("nightly daily journal")).toBeCloseTo(Math.max(score("nightly journal"), score("daily journal")));
  });

  it("never lets a rarer synonym outrank the word that was typed", () => {
    // "chat" is common here, its synonym "conversation" is rare (higher idf).
    const memory = buildIndex(
      splitPassages(
        "x.md",
        ["- chat log one", "- chat log two", "- chat log three", "- chat log four", "- conversation log five"].join("\n")
      )
    );
    const r = search(memory, "chat", 5);
    const synonymHit = r.results.find((x) => x.passage.text.includes("conversation"))!;
    expect(r.results[0].passage.text).toContain("chat");
    expect(synonymHit.score).toBeLessThan(r.results[0].score);
  });
});

describe("search input edge cases", () => {
  it("keeps non-English words instead of dropping them", () => {
    expect(tokenize("café")).toEqual(["café"]);
    expect(tokenize("我们为什么使用DuckDB")).toEqual(["我们为什么使用", "duckdb"]);
  });

  it("splits Chinese, Japanese or Korean text from Latin words next to it, so those are found", () => {
    const memory = buildIndex(splitPassages("x.md", "- We chose DuckDB for SQL.\n- Something else."));
    const r = search(memory, "我们为什么使用DuckDB");
    expect(r.label).toBe("closest");
    expect(r.results[0].passage.text).toContain("DuckDB");
    expect(r.unknownTerms).toEqual(["我们为什么使用"]);
  });

  it("handles a very long run of punctuation quickly", () => {
    const started = performance.now();
    tokenize("a" + ".".repeat(100_000) + "b");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("returns no results for limit 0 and rejects a negative or fractional limit", () => {
    expect(search(index, "pyodide", 0).results).toEqual([]);
    expect(() => search(index, "pyodide", -1)).toThrow(RangeError);
    expect(() => search(index, "pyodide", 1.5)).toThrow(RangeError);
    expect(() => search(index, "pyodide", Number.NaN)).toThrow(RangeError);
  });

  it("cuts very long questions to MAX_QUERY_CHARS, says so, and stays fast", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}x`).join(" ");
    const started = performance.now();
    const r = search(index, `pyodide ${words}`.slice(0, MAX_QUERY_CHARS));
    // ~80 ms locally; the generous bound still catches the old quadratic merge (over 1 s) without
    // failing on a slower CI machine.
    expect(performance.now() - started).toBeLessThan(1000);
    expect(r.truncated).toBe(false);
    expect(search(index, "pyodide " + "x".repeat(MAX_QUERY_CHARS)).truncated).toBe(true);
  });

  it("works on an empty memory", () => {
    expect(search(buildIndex([]), "pyodide")).toMatchObject({ label: "nothing related", results: [], unknownTerms: ["pyodide"] });
  });
});

// "search on the real team memory" tested Casebench 1's notes (PR #8, AlaSQL, anthropicProvider.ts).
// It stayed in the casebench repo; write a new one once Casebench 2's notes have real content.

describe("tables", () => {
  it("ranks the one table row holding a rare word first, even with a common word added", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `| \`file${i}.md\` | the team keeps notes on topic ${i} |`);
    rows[7] = "| `decisions.md` | only the team lead edits it, after the owner agrees |";
    const text = ["# Files", "", "| File | Job |", "|---|---|", ...rows, "", "- The team writes a note after every step."].join("\n");
    const idx = buildIndex(splitPassages("t.md", text));
    expect(search(idx, "decisions.md team").results[0].passage.text).toBe(rows[7]);
  });
});

describe("normalizeTerm", () => {
  it("stems plain words and keeps punctuated ones exact", () => {
    expect(normalizeTerm("Infinite")).toBe(stem("infinite"));
    expect(normalizeTerm("one-on-one")).toBe("one-on-one");
  });
});
