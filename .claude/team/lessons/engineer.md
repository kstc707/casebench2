# Engineer lessons

- **Next.js bundles web workers as classic scripts; Pyodide refuses classic workers.** Serve a plain
  module worker unbundled (`apps/web/scripts/practice-worker.mjs`, copied to `public/pyodide/`). (Practice mode)
- **Next.js page files may only export page things** (default, metadata, …). Put helpers elsewhere.
- **pytest 9 needs `pygments`.** Pin every wheel by version and sha256 (`prepare-pyodide.mjs`).
- **Old commits need the tool versions of their era** (e.g. `pytest.lazy_fixture` is gone from today's
  pytest). Prefer recent fixes for practice tasks.
- **Some projects read their version from the installed package.** Install the project (`pip install -e .`)
  before running its tests, not just `PYTHONPATH=src`.
- **Never `git add -A`.** It once swept a stray `Shell.tsx` into an unrelated commit and broke CI.
- **Watch for shadowed variables.** Reusing `start` turned a duration into "1791530399.8 s".
- **Show the useful line of an error.** pytest repeats "found no collectors" after a SyntaxError; filter
  that out and show the `E `-marked lines.
- **In this sandbox, Node's `fetch` ignores the proxy.** Use `NODE_USE_ENV_PROXY=1` for scripts that
  download.
- **"Same idea" merge rules must name exact relationships** (same word, synonym group, same compound,
  word-is-part-of-compound). "Shares any term" merged two different file names via ".ts". (Librarian)
- **Profile the hot loop before optimising.** Skipping query ideas that can't match anywhere took the worst
  case from 1.2 s to 4 ms; the suspected merge wasn't the cost. (Librarian)
- **`pnpm -s` turns every non-zero exit into 1, and plain `pnpm run` prints "> script" lines.** A CLI for
  agents must put its status inside the JSON. (Librarian `team:ask`)
- **Anchor eval expectations by quoted text, not line numbers.** decisions.md shifted twice in one step and
  silently broke line-range checks. (Librarian)
- **Stemmers bite short words.** Porter's final-"e" rule turned "one" into "on". Leave ≤3-letter words
  alone, and print the matched terms while tuning. (Librarian)

### From the scikit-learn research (Oct 11, Casebench 2)
- **In a long-lived Pyodide worker, an edit to an already-imported library module is silently ignored**
  unless it is removed from `sys.modules` first. Without clearing, #33643 stayed at 4 failed after the
  fix; with clearing, it went to 0.
- **pluggy rejects a hook whose argument isn't named exactly as the hookspec says**
  (`pytest_runtest_logreport(self, report)`); shortening it to `r` raises `PluginValidationError`.
- **Show all the `E ` lines of a pytest failure, not just the first.** For #33643 the first was a bare
  `AssertionError:`.
- **In the browser, the first import of sklearn, scipy and pytest (7.7–8.4 s) costs more than downloading
  the packages.** Do it during "loading" so the student's first click is fast.
