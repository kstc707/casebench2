/**
 * Turns a test run into what the task page says: whether the task is solved, and pytest's errors in
 * plain words. Pure, so the rules are unit-tested (runReport.test.ts).
 */
import type { RunResult, TestResult } from "../runner/types";

export interface CheckVerdict {
  /** Every required test ran and passed, and pytest reported no error. */
  solved: boolean;
  passed: number;
  total: number;
  /** Required tests that ran and didn't pass (failed or skipped). */
  failing: TestResult[];
  /** Required tests with no result: pytest didn't run them. */
  missing: string[];
}

/**
 * "Check my fix" solves the task only when every required test (failToPass + passToPass) is in the
 * result and passed, and pytest reported no error. Anything else (a failure, a skip, a test that
 * didn't run, extra tests that don't count) leaves it unsolved.
 */
export function judgeCheck(required: string[], result: RunResult): CheckVerdict {
  const byId = new Map(result.results.map((r) => [r.id, r]));
  const failing: TestResult[] = [];
  const missing: string[] = [];
  let passed = 0;
  for (const id of required) {
    const r = byId.get(id);
    if (!r || r.outcome === "missing") missing.push(id);
    else if (r.outcome === "passed") passed++;
    else failing.push(r);
  }
  const solved = required.length > 0 && passed === required.length && !result.error;
  return { solved, passed, total: required.length, failing, missing };
}

export interface PlainError {
  /** One sentence for the student. */
  headline: string;
  /** The line of the student's file it points at, when known (for "jump to it"). */
  line?: number;
  /** pytest's own text, shown under "details". */
  details: string;
}

/**
 * Explains pytest's error (RunResult.error) in plain words. `file` is the student's file, e.g.
 * "sklearn/utils/stats.py". Cases, from real runs (see runReport.test.ts):
 *   - a SyntaxError / IndentationError in the student's file (pytest reports it as an ImportError while
 *     loading scikit-learn's conftest);
 *   - a name scikit-learn imports from the student's file that the file no longer defines;
 *   - another error while importing the file (e.g. a NameError at the top level);
 *   - a test id the task names that doesn't exist: pytest then runs nothing at all.
 */
export function explainRunError(error: string, file: string, errorLine?: number): PlainError {
  const details = error.trim();
  const lines = details.split("\n");
  if (/^ERROR: not found: /m.test(details)) {
    return {
      headline:
        "One of this task's tests couldn't be found, so pytest ran none of them. This is probably a problem with the task, not with your code.",
      details,
    };
  }
  const where = lines
    .map((l) => /File "([^"]+)", line (\d+)/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null && m[1].endsWith(file))
    .pop();
  // The runner imports the file by itself after a collection error to find the line (errorLine).
  const line = where ? Number(where[2]) : errorLine;
  const last = [...lines].reverse().find((l) => /^\s*[A-Za-z_][\w.]*(Error|Exception|Warning)\b:?/.test(l))?.trim();
  const syntax = last && /^(SyntaxError|IndentationError|TabError): (.*)$/.exec(last);
  if (syntax) {
    const kind = syntax[1] === "SyntaxError" ? "a syntax error" : "an indentation error";
    return { headline: `Your file has ${kind}${line ? ` on line ${line}` : ""}: ${syntax[2]}`, line, details };
  }
  const module = file.replace(/\.py$/, "").split("/").join(".");
  const missingName = new RegExp(`cannot import name '(\\w+)' from '${module.replace(/\./g, "\\.")}'`).exec(details);
  if (missingName) {
    return { headline: `scikit-learn imports \`${missingName[1]}\` from your file, but your file no longer defines it.`, details };
  }
  if (/while loading conftest|ERROR collecting/.test(details) && last) {
    const at = line ? ` (line ${line})` : " (somewhere at the top level of your file)";
    return { headline: `Your file couldn't be loaded${at}: ${last}`, line, details };
  }
  return { headline: `pytest couldn't run the tests${last ? `: ${last}` : "."}`, line, details };
}

/** The 1-based line where a function or class is defined ("Class.method" looks inside the class), or null. */
export function findSymbolLine(code: string, symbol: string): number | null {
  const lines = code.split("\n");
  let from = 0;
  const parts = symbol.split(".");
  for (let p = 0; p < parts.length; p++) {
    const re = new RegExp(`^\\s*(async\\s+def|def|class)\\s+${parts[p].replace(/[^\w]/g, "")}\\b`);
    const i = lines.findIndex((l, idx) => idx >= from && re.test(l));
    if (i === -1) return null;
    if (p === parts.length - 1) return i + 1;
    from = i + 1;
  }
  return null;
}

/** One sentence about a finished run, for screen readers (the page's aria-live region) and the e2e check. */
export function runSummary(kind: "issue" | "check", result: RunResult, issueIds: string[], required: string[], file: string): string {
  if (result.error) return explainRunError(result.error, file, result.errorLine).headline;
  if (kind === "check") {
    const v = judgeCheck(required, result);
    return v.solved ? `Solved. All ${v.total} required tests pass.` : `${v.passed} of ${v.total} required tests pass.`;
  }
  const passed = issueIds.filter((id) => result.results.some((r) => r.id === id && r.outcome === "passed")).length;
  return `${passed} of ${issueIds.length} of the issue's tests pass.`;
}
