/**
 * Splits scikit-learn's contributing docs (content/scikit-learn/contributing/) into citable passages,
 * at build time. The browser gets the passages and searches them (lib/coach/retrieval.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { splitPassages, type Passage } from "@casebench2/team-memory/src/corpus";
import { contentDir } from "../tasks";
import { rstHeadingsToMarkdown, usefulPassages } from "./retrieval";

/** The documents the coach searches, as paths under content/scikit-learn/. */
export const RULE_FILES = ["contributing/contributing.rst", "contributing/PULL_REQUEST_TEMPLATE.md", "contributing/upcoming_changes-README.md", "contributing/CONTRIBUTING.md"];

export function loadRulePassages(dir = contentDir()): Passage[] {
  return RULE_FILES.flatMap((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    return usefulPassages(splitPassages(f, f.endsWith(".rst") ? rstHeadingsToMarkdown(text) : text));
  });
}
