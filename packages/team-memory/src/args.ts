/**
 * Command-line arguments for `pnpm team:ask`. Pure, so it can be tested
 * without running the command.
 *
 *   pnpm team:ask "question" [--limit N] [--json]
 */

export const USAGE = `Usage: pnpm team:ask "question" [--limit N] [--json]

Searches the team's notes (.claude/team, docs/build-log) for the passages closest to your question.
  --limit N   how many passages to show (whole number, default 3)
  --json      machine-readable output for agents (read "label" first)
  --help      show this help
A question that starts with "-" goes after a "--", e.g. pnpm team:ask --json -- "-x flag?"`;

export const DEFAULT_LIMIT = 3;

export type ParsedArgs =
  | { kind: "ask"; question: string; limit: number; json: boolean }
  | { kind: "help" }
  /** `json` says whether --json was given, so the error can be printed as JSON too. */
  | { kind: "error"; message: string; json: boolean };

/**
 * Parse the arguments after the script name. Several plain words are joined
 * with spaces, so an unquoted question still works.
 *
 * "--" as the FIRST argument is dropped: it's the pnpm/npm habit of
 * separating the command from its arguments (`pnpm team:ask -- "q" --json`),
 * and flags after it still count. A "--" anywhere later means "everything
 * after this is question text", for a question that starts with "-".
 */
export function parseAskArgs(argv: string[]): ParsedArgs {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const words: string[] = [];
  let limit = DEFAULT_LIMIT;
  let json = false;
  let error: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      words.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      words.push(arg);
      continue;
    }
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--limit" || arg.startsWith("--limit=")) {
      const value = arg === "--limit" ? args[++i] : arg.slice("--limit=".length);
      if (value === undefined) error ??= "--limit needs a number, e.g. --limit 5";
      else if (!/^\d+$/.test(value)) error ??= `--limit must be a whole number ≥ 0, got "${value}"`;
      else limit = Number(value);
      continue;
    }
    error ??= `Unknown option: ${arg}`;
  }

  // Parsing goes on after an error, so a later --json still gets a JSON error.
  if (error) return { kind: "error", message: error, json };
  const question = words.join(" ").trim();
  if (question === "") return { kind: "error", message: "Missing question.", json };
  return { kind: "ask", question, limit, json };
}
