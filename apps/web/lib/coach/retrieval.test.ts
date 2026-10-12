import { describe, expect, it } from "vitest";
import { search } from "@casebench2/team-memory/src/search";
import { loadRulePassages } from "./passages";
import { indexRules, retrieveRules, REVIEW_QUERIES, rstHeadingsToMarkdown } from "./retrieval";

describe("rstHeadingsToMarkdown", () => {
  it("turns underlined (and overlined) titles into ## headings, keeping line numbers", () => {
    const rst = ["============", "Contributing", "============", "", "Intro text.", "", "Pull request checklist", "----------------------", "", "* item"].join("\n");
    const md = rstHeadingsToMarkdown(rst).split("\n");
    expect(md).toHaveLength(10);
    expect(md[1]).toBe("## Contributing");
    expect(md[0]).toBe("");
    expect(md[6]).toBe("## Pull request checklist");
    expect(md[7]).toBe("");
    expect(md[9]).toBe("* item");
  });
});

describe("retrieval over scikit-learn's contributing docs", () => {
  const passages = loadRulePassages();
  const index = indexRules(passages);
  const top = (q: string) => search(index, q, 3).results.map((r) => `${r.passage.file} § ${r.passage.heading}`);

  it("splits the docs into many passages with headings", () => {
    expect(passages.length).toBeGreaterThan(100);
    expect(passages.some((p) => p.heading === "Automated Contributions Policy")).toBe(true);
  });

  it.each([
    ["Can I use AI tools to write my pull request?", "contributing/contributing.rst § Automated Contributions Policy"],
    ["should my PR modify unrelated lines", "contributing/contributing.rst § Pull request checklist"],
    ["how do I name the changelog news fragment file", "contributing/upcoming_changes-README.md § Changelog instructions"],
    ["Reference Issues/PRs Fixes keyword closing issues", "contributing/PULL_REQUEST_TEMPLATE.md § "],
    ["non-regression tests should fail on main and pass for the PR", "contributing/contributing.rst § "],
  ])("%s → %s", (q, want) => {
    expect(top(q).some((t) => t.startsWith(want))).toBe(true);
  });

  it("gives the review a small, labelled, deduplicated set of rule passages", () => {
    const rules = retrieveRules(index, REVIEW_QUERIES);
    expect(rules.length).toBeGreaterThanOrEqual(5);
    expect(rules.length).toBeLessThanOrEqual(8);
    expect(rules.map((r) => r.id)).toEqual(rules.map((_, i) => `R${i + 1}`));
    expect(new Set(rules.map((r) => `${r.file}:${r.startLine}`)).size).toBe(rules.length);
    expect(rules.some((r) => r.heading === "Automated Contributions Policy")).toBe(true);
    expect(rules.some((r) => r.file === "contributing/upcoming_changes-README.md")).toBe(true);
  });
});
