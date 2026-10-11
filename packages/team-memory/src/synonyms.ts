/**
 * Words that mean the same thing in our team memory, kept by hand.
 *
 * Keyword search only finds the words you type. When someone asks about an
 * "endless loop" but the notes say "infinite loop", BM25 scores that passage
 * zero for the word that matters. Each group below lists words that should
 * find each other: a query word also searches for the other words in its group.
 *
 * Rules for this list:
 * - Add a group only when a real question missed because of it, and at least
 *   one of the words really appears in `.claude/team/**` or `docs/build-log/**`.
 *   (Every group below came from a miss in the librarian risk check, Oct 2026.)
 * - Keep groups small and specific. A broad group ("run" = "execute" = "start")
 *   makes many unrelated passages match and pushes the right one down.
 * - Write words as they appear in text, lowercase. They go through the same
 *   word-ending rules as everything else (see `normalizeTerm` in search.ts), so
 *   "infinite" also covers "infinites"; hyphenated words like "one-on-one" are
 *   matched as one exact word.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // "an infinite loop" (build log 14) vs. "stuck in an endless loop"
  ["endless", "infinite"],
  // "could fake a passing result" (decisions, build log 14) vs. "cheat"
  ["cheat", "fake"],
  // "one-on-one chats" (team README, decisions) vs. "one-to-one conversation"
  ["conversation", "chat"],
  ["one-to-one", "one-on-one"],
  // "nightly journal" (decisions) vs. "daily journal" (journal)
  ["daily", "nightly"],
  // Python in the browser is Pyodide, which is WebAssembly ("wasm")
  ["webassembly", "pyodide", "wasm"],
];
