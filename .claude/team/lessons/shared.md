# Lessons for everyone

One or two lines each, with where it came from. The team lead adds these in retros and removes ones that
turn out wrong.

- **Tell "the environment is broken" apart from "there's no bug / it doesn't work".** The first spike
  reported 19/62 usable tasks: every old commit crashed on import and was counted as "no bug". The real
  number was 39/62. (Practice spike, Oct 2026)
- **Free-tier AI models get retired.** Gemini 2.5 disappeared and the live coworkers went silent. Keep
  model names in config, retry on 429/5xx, and make an AI failure visible to the user. (Build log 10)
- **Don't trust a single success.** Run on a second project or a second case before believing a result
  (humanize 63% vs prettytable 41% convertible). (Practice spike)
- **The owner wants control.** No code before an approved plan; one section at a time; say what's not done.
  (Owner, Oct 2026)
- **This sandbox blocks some hosts** (e.g. cdn.jsdelivr.net, api.github.com, some company sites). Self-host
  what the app needs, and say in reports when something couldn't be checked because of it. (Practice mode)
- **Check what the AI layer actually returns before planning metrics on it.** Token-based grading is in
  the vision, but `packages/ai` drops `usage` entirely (`anthropicProvider.ts`), so nothing downstream can
  count tokens yet. (Researcher trial run, Oct 2026)

### From the librarian build (Oct 11)
- **Run the documented command exactly as users and agents will type it.** Every unit test passed while
  `pnpm team:ask … --json` printed pnpm banners before the JSON. Add a test that runs the real command.
- **Run the whole suite the way CI does, and also with `pnpm -s test`.** pnpm leaks
  `npm_config_reporter=silent` into child processes; a committed test failed only under `-s`.
- **Notes that record their own evaluation contaminate it.** The journal quoted test questions and
  changed results within one round. Refer to eval questions by id or topic, never verbatim (a CI test now
  enforces this for the searched notes).
- **Keyword overlap measures topic, not whether the fact is there.** Never present a keyword hit as "the
  answer"; near-miss questions got confident labels with the fact missing.
- **An empty result should be an error, not "no match".** A wrong path silently gave an empty corpus,
  which would have looked like "not found" for everything.

### From the scikit-learn track (Oct 11, Casebench 2)
- **A test skipped in our environment can hide a broken fix.** List every skipped test and ask whether it
  exercises the edited code: for #33643, the two tests of the edited function were skipped, and a wrong fix
  "solved" the task.
- **A checker that only re-runs the ids in its own manifest can't catch a weakened manifest.** Recompute
  from the whole test file and compare.
- **Every file that decides "solved" needs an anchor the author can't edit** (`before/` and `tests/` against
  the shipped 1.8.0 package, `tests.diff` against the upstream diff in `source.md`).
- **Check where a wrapper component puts ARIA props:** `aria-label` on `<CodeMirror>` landed on a plain div.
  Inspect the accessibility tree, don't trust that the prop was accepted.
- **Time "usable again", not just "stopped":** a 60 s timeout means about 76 s for the student, because
  Python has to restart.
