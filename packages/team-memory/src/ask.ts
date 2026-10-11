/**
 * The librarian's command: search the team's notes for a question.
 *
 *   pnpm team:ask "question" [--limit N] [--json]
 *
 * A thin wrapper: parsing is in args.ts, wording in format.ts, search in
 * search.ts. Exit codes: 0 passages shown (or --limit 0 on a related
 * question), 1 nothing related, 2 usage error, 3 no team memory found.
 * With --json, stdout is always JSON: the results, or {"error", "exitCode"}
 * (the human message still goes to stderr). Agents should read `label` first.
 * Agents run `pnpm -s team:ask … --json`: `-s` keeps pnpm's "> script" lines
 * out of stdout, but pnpm then reports any failure as exit 1, so the JSON
 * (`label`, or `exitCode` in an error) is the reliable status. Without `-s`,
 * pnpm passes the real exit code through.
 */
import { parseAskArgs, USAGE } from "./args";
import { loadCorpus, type Passage } from "./corpus";
import { exitCodeFor, formatHuman, formatJson, formatJsonError } from "./format";
import { buildIndex, search } from "./search";

function fail(message: string, exitCode: number, json: boolean, usage: boolean): never {
  process.stderr.write(usage ? `${message}\n\n${USAGE}\n` : `${message}\n`);
  if (json) process.stdout.write(formatJsonError(message, exitCode));
  process.exit(exitCode);
}

const args = parseAskArgs(process.argv.slice(2));
if (args.kind === "help") {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}
if (args.kind === "error") fail(args.message, 2, args.json, true);

let passages: Passage[];
try {
  passages = loadCorpus();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err), 3, args.json, false);
}

const response = search(buildIndex(passages), args.question, args.limit);
const meta = { question: args.question, passageCount: passages.length };
process.stdout.write(args.json ? formatJson(response, meta) : formatHuman(response, meta));
process.exitCode = exitCodeFor(response);
