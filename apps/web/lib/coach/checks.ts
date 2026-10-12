/**
 * The coach's automatic checks (stages 1 and 2 of "Prepare your pull request"). No AI: pure functions
 * over the student's file, the PR form and the changelog fragment. Each check cites the scikit-learn
 * rule it comes from, as a quote found word for word in content/scikit-learn/contributing/
 * (checks.test.ts verifies every quote).
 */
import { findSymbolLine } from "../sklearn/runReport";

export interface Rule {
  /** A file in content/scikit-learn/, e.g. "contributing/contributing.rst". */
  file: string;
  quote: string;
}

export interface CheckResult {
  id: string;
  ok: boolean;
  title: string;
  /** What was found, in plain words (and what to do when it isn't ok). */
  detail: string;
  rule: Rule;
}

export const RULES = {
  unrelated: { file: "contributing/contributing.rst", quote: "You didn't modify unrelated lines. Keep the PR focused on the scope stated in its issue." },
  lineLength: { file: "contributing/pyproject.toml", quote: "line-length = 88" },
  whitespace: { file: "contributing/pyproject.toml", quote: 'extend-select = ["E501", "W", "I", "CPY001", "PGH", "RUF", "TID252"]' },
  guidelines: { file: "contributing/contributing.rst", quote: "You followed the :ref:`coding-guidelines` and properly commented and documented your code." },
  tests: {
    file: "contributing/contributing.rst",
    quote: "the tests should fail for the code base in the ``main`` branch and pass for the PR code.",
  },
  reference: { file: "contributing/PULL_REQUEST_TEMPLATE.md", quote: "Please use keywords (e.g., Fixes) to create link to the issues or pull requests you resolved" },
  explain: { file: "contributing/PULL_REQUEST_TEMPLATE.md", quote: "#### What does this implement/fix? Explain your changes." },
  aiDisclosure: { file: "contributing/contributing.rst", quote: "If you used AI tools, you need to state so in your PR description." },
  fragmentName: { file: "contributing/upcoming_changes-README.md", quote: "Each file should be named like `<PULL REQUEST>.<TYPE>.rst`" },
  singleBullet: { file: "contributing/upcoming_changes-README.md", quote: "In almost all cases, your fragment should be formatted as a **single** bullet point." },
  byUser: { file: "contributing/upcoming_changes-README.md", quote: "By :user:`Adam Li <adam2392>`." },
  roles: { file: "contributing/upcoming_changes-README.md", quote: "- :class:`ensemble.ExtraTreesClassifier` and :class:`ensemble.ExtraTreesRegressor`" },
} satisfies Record<string, Rule>;

// ---------------------------------------------------------------------------------------------------
// Line diff
// ---------------------------------------------------------------------------------------------------

export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
  /** 1-based line in the original ("before") file; for an added line, the original line it comes before. */
  beforeLine: number;
  /** 1-based line in the student's file (for "same" and "add"). */
  afterLine?: number;
}

/**
 * A line diff between two texts. Common lines at the start and end are matched first, then the middle
 * (small for a bug fix) by longest common subsequence, so whole-file sizes stay cheap.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ma = a.slice(start, endA);
  const mb = b.slice(start, endB);
  if (ma.length * mb.length > 4_000_000) throw new Error("The change is too large to compare line by line.");
  // LCS table over the middle.
  const lcs: Uint32Array[] = Array.from({ length: ma.length + 1 }, () => new Uint32Array(mb.length + 1));
  for (let i = ma.length - 1; i >= 0; i--) {
    for (let j = mb.length - 1; j >= 0; j--) {
      lcs[i][j] = ma[i] === mb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  for (let k = 0; k < start; k++) out.push({ type: "same", text: a[k], beforeLine: k + 1, afterLine: k + 1 });
  let i = 0;
  let j = 0;
  while (i < ma.length || j < mb.length) {
    if (i < ma.length && j < mb.length && ma[i] === mb[j]) {
      out.push({ type: "same", text: ma[i], beforeLine: start + i + 1, afterLine: start + j + 1 });
      i++;
      j++;
    } else if (j < mb.length && (i === ma.length || lcs[i][j + 1] > lcs[i + 1][j])) {
      out.push({ type: "add", text: mb[j], beforeLine: start + i + 1, afterLine: start + j + 1 });
      j++;
    } else {
      out.push({ type: "del", text: ma[i], beforeLine: start + i + 1 });
      i++;
    }
  }
  for (let k = endA; k < a.length; k++) out.push({ type: "same", text: a[k], beforeLine: k + 1, afterLine: endB + (k - endA) + 1 });
  return out;
}

/** A unified diff of the student's change, for the AI review (only the changed parts, with context). */
export function unifiedDiff(file: string, before: string, after: string, context = 3): string {
  const d = diffLines(before, after);
  const changed = d.map((l, i) => (l.type === "same" ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return "";
  const out = [`--- a/${file}`, `+++ b/${file}`];
  let k = 0;
  while (k < changed.length) {
    const from = Math.max(0, changed[k] - context);
    let to = Math.min(d.length - 1, changed[k] + context);
    while (k + 1 < changed.length && changed[k + 1] - context <= to + 1) {
      k++;
      to = Math.min(d.length - 1, changed[k] + context);
    }
    const hunk = d.slice(from, to + 1);
    const aStart = hunk.find((l) => l.type !== "add")?.beforeLine ?? hunk[0].beforeLine;
    const bStart = hunk.find((l) => l.type !== "del")?.afterLine ?? 1;
    out.push(`@@ -${aStart},${hunk.filter((l) => l.type !== "add").length} +${bStart},${hunk.filter((l) => l.type !== "del").length} @@`);
    for (const l of hunk) out.push(`${l.type === "same" ? " " : l.type === "add" ? "+" : "-"}${l.text}`);
    k++;
  }
  return out.join("\n") + "\n";
}

/** The lines (1-based, inclusive) of the top-level function or class a symbol lives in ("Class.method" → the class). */
export function blockRange(code: string, symbol: string): [number, number] | null {
  const top = symbol.split(".")[0];
  const start = findSymbolLine(code, top);
  if (start === null) return null;
  const lines = code.split("\n");
  const indent = (s: string) => s.length - s.trimStart().length;
  const base = indent(lines[start - 1]);
  let end = start;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") continue;
    if (indent(l) <= base && !/^\s*[)\]}]/.test(l)) break;
    end = i + 1;
  }
  return [start, end];
}

// An expression made of code tokens only: names, numbers, strings, brackets and operators. Two plain
// words in a row ("weighted value") make it English, not code.
const EXPR = String.raw`[\w.\[\]()'"+\-*/%<>=!,:]+(?:\s*(?:[+\-*/%<>]=?|==|!=|\bis\b|\bin\b|\bnot\b|\band\b|\bor\b|,)\s*[\w.\[\]()'"+\-*/%<>=!,:]+)*`;
const CODE_LINE = [
  String.raw`(?:if|elif|while)\s+${EXPR}\s*:`, // if next_index > max_idx:
  String.raw`for\s+[\w, ]+\s+in\s+${EXPR}\s*:`, // for col_idx in zero_weight_cols:
  String.raw`(?:else|try|finally)\s*:|except(?:\s+${EXPR})?\s*:`,
  String.raw`return(?:\s+${EXPR})?`, // return result
  String.raw`(?:def|class)\s+\w+\s*[(:].*`,
  String.raw`import\s+[\w.]+(?:\s+as\s+\w+)?|from\s+[\w.]+\s+import\s+.+`,
  String.raw`[\w.\[\]]+\s*(?:[+\-*/]?=)\s*${EXPR}`, // next_index = percentile_indices[col_idx]
  String.raw`[\w.]+\(.*\)`, // print(next_index)
];
/**
 * A comment whose whole text parses as one line of Python-looking code. English comments that start
 * with a keyword ("# for zero weights, skip ahead:", "# if the next weight is 0, move on:") don't match,
 * and neither does "# result = weighted value": its right-hand side is two plain words, which we read
 * as English (a borderline call: it could be a typo'd expression, but flagging prose is worse).
 */
export const COMMENTED_CODE = new RegExp(String.raw`^\s*#\s*(?:${CODE_LINE.join("|")})\s*$`);

/** Whether an added line looks like code that was commented out. */
export function looksLikeCommentedCode(line: string): boolean {
  return COMMENTED_CODE.test(line);
}

const lineList = (ns: number[]) => (ns.length > 8 ? `${ns.slice(0, 8).join(", ")}, …` : ns.join(", "));

export interface CodeCheckInput {
  file: string;
  before: string;
  code: string;
  /** about.json's whereToLook.symbol. */
  symbol: string;
  /** The real fix's size. */
  fixSize: { added: number; removed: number };
  /** "Check my fix" passed (the task is solved). */
  solved: boolean;
}

/** Stage 1: scope, style and tests of the student's change. */
export function codeChecks(input: CodeCheckInput): CheckResult[] {
  const d = diffLines(input.before, input.code);
  const adds = d.filter((l) => l.type === "add");
  const dels = d.filter((l) => l.type === "del");
  const changed = adds.length + dels.length;
  const realSize = input.fixSize.added + input.fixSize.removed;
  const limit = Math.max(3 * realSize, realSize + 10);
  const range = blockRange(input.before, input.symbol);
  const outside = range
    ? [...new Set([...adds, ...dels].map((l) => l.beforeLine).filter((n) => n < range[0] || n > range[1] + 1))].sort((x, y) => x - y)
    : [];
  // A line re-added with only its inner or trailing spacing changed (same indentation): reformatting.
  // A change of indentation alone is not flagged: wrapping code in try/except moves lines legitimately.
  const spacingKey = (t: string) => `${t.length - t.trimStart().length}|${t.trim().replace(/\s+/g, " ")}`;
  const delKeys = new Set(dels.map((l) => spacingKey(l.text)));
  const delTexts = new Set(dels.map((l) => l.text));
  const whitespaceOnly = adds.filter((l) => l.text.trim() !== "" && !delTexts.has(l.text) && delKeys.has(spacingKey(l.text))).map((l) => l.afterLine!);
  const added = (test: (t: string) => boolean) => adds.filter((l) => test(l.text)).map((l) => l.afterLine!);
  const long = added((t) => t.length > 88);
  const trailing = added((t) => /[ \t]+$/.test(t));
  const tabs = added((t) => t.includes("\t"));
  const debug = added((t) => /^\s*(print\(|breakpoint\(\)|import pdb|pdb\.set_trace\()/.test(t));
  const commented = added(looksLikeCommentedCode);
  const symbolTop = input.symbol.split(".")[0];

  return [
    {
      id: "scope-size",
      ok: changed > 0 && changed <= limit,
      title: "The change is small and focused",
      detail:
        changed === 0
          ? "You haven't changed the file."
          : `You changed ${changed} line${changed === 1 ? "" : "s"}; the real fix changed ${realSize}.` +
            (changed > limit ? " Look for edits you don't need: reviewers ask for the smallest change that fixes the issue." : ""),
      rule: RULES.unrelated,
    },
    {
      id: "scope-place",
      ok: range !== null && outside.length === 0,
      title: `Edits stay inside ${symbolTop}`,
      detail: outside.length
        ? `Lines outside ${symbolTop} were changed (original lines ${lineList(outside)}). Is each one needed for this fix?`
        : `All your edits are inside ${symbolTop}.`,
      rule: RULES.unrelated,
    },
    {
      id: "scope-unrelated",
      ok: whitespaceOnly.length === 0,
      title: "No unrelated reformatting",
      detail: whitespaceOnly.length
        ? `Line${whitespaceOnly.length === 1 ? "" : "s"} ${lineList(whitespaceOnly)} only change spacing. Put them back as they were.`
        : "No line changes only its spacing.",
      rule: RULES.unrelated,
    },
    {
      id: "style-length",
      ok: long.length === 0,
      title: "Lines are at most 88 characters",
      detail: long.length ? `Line${long.length === 1 ? "" : "s"} ${lineList(long)} ${long.length === 1 ? "is" : "are"} longer than 88 characters.` : "Every line you added fits in 88 characters.",
      rule: RULES.lineLength,
    },
    {
      id: "style-whitespace",
      ok: trailing.length === 0 && tabs.length === 0,
      title: "No trailing spaces or tabs",
      detail:
        trailing.length || tabs.length
          ? [trailing.length ? `trailing spaces on line ${lineList(trailing)}` : "", tabs.length ? `tabs on line ${lineList(tabs)}` : ""].filter(Boolean).join("; ") + "."
          : "No trailing spaces or tabs in the lines you added.",
      rule: RULES.whitespace,
    },
    {
      id: "style-debug",
      ok: debug.length === 0 && commented.length === 0,
      title: "No leftover debugging or commented-out code",
      detail:
        debug.length || commented.length
          ? [debug.length ? `print/breakpoint on line ${lineList(debug)}.` : "", commented.length ? `Line ${lineList(commented)} looks like commented-out code — is it?` : ""].filter(Boolean).join(" ")
          : "No print(), breakpoint() or commented-out code in the lines you added.",
      rule: RULES.guidelines,
    },
    {
      id: "tests",
      ok: input.solved,
      title: "The tests fail before your change and pass after it",
      detail: input.solved ? "\"Check my fix\" passed: every required test passes with your change." : "Run \"Check my fix\" until every required test passes.",
      rule: RULES.tests,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------
// Stage 2: the pull request text and the changelog fragment
// ---------------------------------------------------------------------------------------------------

/** The sections of scikit-learn's pull request template (.github/PULL_REQUEST_TEMPLATE.md). */
export interface PrForm {
  reference: string;
  what: string;
  introduce: string;
  aiDisclosure: string;
  other: string;
}

export const EMPTY_PR: PrForm = { reference: "", what: "", introduce: "", aiDisclosure: "", other: "" };

/** The template's headings, in order, for showing and for building the PR body. */
export const PR_SECTIONS: Array<{ key: keyof PrForm; heading: string }> = [
  { key: "reference", heading: "Reference Issues/PRs" },
  { key: "what", heading: "What does this implement/fix? Explain your changes." },
  { key: "introduce", heading: "Introduce yourself" },
  { key: "aiDisclosure", heading: "AI usage disclosure" },
  { key: "other", heading: "Any other comments?" },
];

/** The PR description as scikit-learn's template lays it out. */
export function prBody(form: PrForm): string {
  return PR_SECTIONS.map((s) => `#### ${s.heading}\n${form[s.key].trim()}\n`).join("\n");
}

export function prChecks(form: PrForm): CheckResult[] {
  const ref = form.reference.trim();
  return [
    {
      id: "pr-reference",
      ok: ref !== "",
      title: "Reference Issues/PRs is filled in",
      detail: ref === "" ? "Say which issue or PR this resolves, e.g. \"Fixes #1234\"." : /\b(fix(es|ed)?|close[sd]?|resolve[sd]?)\s+#\d+/i.test(ref) ? "Uses a closing keyword, so the issue closes when the PR is merged." : "Filled in. A keyword like \"Fixes #1234\" closes the issue automatically on merge.",
      rule: RULES.reference,
    },
    {
      id: "pr-what",
      ok: form.what.trim().length >= 40,
      title: "You explain what the change does and why",
      detail: form.what.trim().length >= 40 ? "Explained." : "Write a few sentences: what was wrong, what you changed, and why that fixes it.",
      rule: RULES.explain,
    },
    {
      id: "pr-ai",
      ok: form.aiDisclosure.trim() !== "",
      title: "AI usage disclosure is filled in",
      detail: form.aiDisclosure.trim() === "" ? "State whether and how you used AI tools (or write that you didn't)." : "Filled in.",
      rule: RULES.aiDisclosure,
    },
  ];
}

/** Where the fragment goes, e.g. doc/whats_new/upcoming_changes/sklearn.utils/<PR>.fix.rst. */
export function fragmentPath(folder: string, type: string, pr: number | string = "<PR number>"): string {
  return `doc/whats_new/upcoming_changes/${folder}/${pr}.${type}.rst`;
}

/** "By :user:`A`." or several authors: "By :user:`A`, :user:`B` and :user:`C`." */
const USER = "(?::user:`[^`]+`)";
export const BY_USERS = new RegExp(`By ${USER}(?:(?:, | and |, and )${USER})*\\.?$`);

export function changelogChecks(text: string, mentions: string[]): CheckResult[] {
  const t = text.replace(/\s+$/, "");
  const lines = t.split("\n");
  const bullets = lines.filter((l) => /^[-*+] /.test(l)).length;
  const escaped = (m: string) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentioned = mentions.some((m) => new RegExp(`(:[a-z]+:\`[^\`]*\\b${escaped(m)}\\b[^\`]*\`|\`\`[^\`]*\\b${escaped(m)}\\b[^\`]*\`\`)`).test(t));
  return [
    {
      id: "fragment-bullet",
      ok: t.startsWith("- ") && bullets === 1,
      title: "One bullet, starting with \"- \"",
      detail: !t.startsWith("- ") ? "Start the fragment with \"- \"." : bullets > 1 ? `There are ${bullets} bullets; the changelog tool handles only one per fragment.` : "One bullet.",
      rule: RULES.singleBullet,
    },
    {
      id: "fragment-user",
      ok: BY_USERS.test(t),
      title: "Ends with By :user:`…`",
      detail: BY_USERS.test(t) ? "Credits you." : "End with By :user:`Your Name <your-github-handle>`.",
      rule: RULES.byUser,
    },
    {
      id: "fragment-role",
      ok: mentioned,
      title: `Names ${mentions.join(" / ")} with a ReST role`,
      detail: mentioned
        ? "The changed function or class is named, so the changelog links to it."
        : `Name what you changed with a role such as :func:\`…\` or :class:\`…\` (or \`\`${mentions[0]}\`\` for a private name).`,
      rule: RULES.roles,
    },
  ];
}
