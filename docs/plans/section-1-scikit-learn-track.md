# Plan: Section 1, the scikit-learn track

## Goal
A student opens the scikit-learn path, picks one of 5 real, already-merged fixes, reads what it teaches
and what the real issue said, edits the "before" version of one scikit-learn file in the browser, and runs
scikit-learn's own tests (from the real fix) right there. When every required test passes, the task counts
as solved, and the path shows it.

Built on the decision "scikit-learn track runs in the browser on Pyodide 314.0.7" (decisions.md, 2026-10-11)
and on Casebench 1's practice engine (`/home/user/casebench/apps/web`, build log 14).

## What the student will see when it's done
- **`/` (home):** one card, "scikit-learn: fix real bugs from the project's history", with "2 of 5 solved".
- **`/scikit-learn` (the path):** the 5 tasks in a suggested order (smallest fix first). Each row shows
  the title, what it teaches (e.g. "edge cases in a numerical helper"), the file you'll edit, and a status:
  *Not started / In progress / Solved*. A note says progress is saved in this browser only.
- **`/scikit-learn/<task>` (the task page), laid out like Casebench 1's practice page:**
  - **Left:** *What this teaches* · *The real issue* (a short summary written by us, plus quoted lines from
    the real GitHub issue, with a link) · *Where to look* (the function name, with a "jump to it" button) ·
    the tests you must make pass, with pytest's real failure line when they fail.
  - **Right:** a code editor with the one file you may change (e.g. `sklearn/utils/stats.py`, exactly as
    shipped in scikit-learn 1.8.0), and a read-only tab with the test file.
  - **Two buttons:** **Run the issue's tests** (only the tests the real fix added; about 2–4 s after the
    first run) and **Check my fix** (the issue's tests plus every other test in that file that must keep
    passing; up to about 40 s). Only "Check my fix" can mark the task solved.
  - First visit: "Downloading Python and scikit-learn (about 39 MB, only once)", with progress.
  - Your edits are kept as a draft if you leave. **Reset to the original code** puts the 1.8.0 file back.
  - **After solving:** "Solved. Checked in your browser." Then the real fix as a diff, and a link to the
    real pull request so you can read how the maintainers reviewed it.

## Steps
Each step is one reviewable piece with its own check. Steps 2–10 happen only after step 1 passes.

1. **Risk check: one task in a real browser (throwaway spike, not app code).**
   Files: a spike folder in the scratchpad (a static HTML page, a module worker, a Playwright script);
   results written up in `research/sklearn-browser-spike/README.md` in the repo.
   Serve the self-hosted Pyodide 314.0.7 files (from the GitHub release tarball, not jsDelivr) from a local
   static server. In headless Chromium (Playwright; Chromium is already installed at `/opt/pw-browsers`),
   in a module web worker:
   (a) load scikit-learn, its tests and pytest;
   (b) run task #33127: the "before" code fails its test, the real fix passes, and the "before" code
   fails again, all in the same worker (this proves edits take effect after clearing `sys.modules`);
   (c) run the issue's tests for all 5 tasks, and "Check my fix" for the largest file (#33176).
   Record: download size, first load time, re-run time, full-check time and memory.
   · done when: (b) passes in the browser and the numbers are written down
   · checked by: the Playwright script's output, pasted into the README
   · **owner/lead decision point:** if it fails, stop and report before building anything (see "Risk check first").

2. **Create the web app shell.** Files: `apps/web/` (Next.js 15, React 19, TypeScript, `package.json`
   named `@casebench2/web`, `next.config.js`, `tsconfig.json`), a placeholder home page, `.gitignore`
   for `apps/web/public/pyodide/`, root `vitest.config.mts` picking up `apps/web` tests.
   · done when: `pnpm dev` shows the home page and `pnpm typecheck` / `pnpm test` / `pnpm -s test` pass.

3. **Self-host Pyodide, pinned.** File: `apps/web/scripts/prepare-pyodide.mjs` (adapted from Casebench 1).
   Downloads `pyodide-314.0.7.tar.bz2` from GitHub releases once into a local cache, refuses it unless its
   SHA-256 is `192b5864…6645`, and extracts only the core files plus the 18 packages scikit-learn,
   its tests and pytest need (about 26 MB of packages, about 39 MB in total). It then checks each package
   file against the SHA-256 in `pyodide-lock.json` and copies them to `public/pyodide/314.0.7/`.
   No PyPI downloads (Pyodide's own pytest 9.0.2 is used). Uses `NODE_USE_ENV_PROXY=1` (engineer lesson).
   · done when: `pnpm --filter @casebench2/web pyodide` produces the folder; a second run downloads nothing.
   · checked by: Vitest tests for the package list (worked out from the lock file) and for refusing a file
     whose SHA-256 doesn't match.

4. **The test runner (shared by browser and CI).** Files: `apps/web/lib/runner/runner.py`,
   `apps/web/scripts/runner-worker.mjs` (a plain module worker, not bundled by Next.js, engineer lesson),
   `apps/web/lib/runner/runner.ts` (Node side) and `useTestRunner.ts` (browser side), adapted from
   Casebench 1. Changes from Casebench 1: it writes the student's file *over* the installed scikit-learn
   file, keeps the original so it can put it back before the next run or task, clears every `sklearn`
   module from `sys.modules` before each run (researcher lesson), and runs exactly the given test ids.
   Keeps Casebench 1's error display (show the `E ` lines, drop "found no collectors"). Timeout: 60 s for
   the issue's tests, 120 s for "Check my fix", then Python restarts.
   · done when: the Node side runs #33127 before (1 failed) and after (1 passed) in one Python.
   · checked by: a Vitest test that runs that (in the slower "tasks" CI job), plus unit tests for the
     restore-the-original logic and the syntax-error display.

5. **Task builder + generated content for the 5 tasks.** Files: `content/scikit-learn/sources.json`
   (the seed list: slug, PR number, merge commit, base tag 1.8.0 and its commit), and
   `apps/web/scripts/build-sklearn-tasks.ts` (a port of the researcher's `build_tasks.py`).
   Given a local scikit-learn clone, it rebuilds the "before" and "after" files for each PR, runs the
   whole test file on both with the step 4 runner, and records:
   - `failToPass`: tests that fail before and pass after;
   - `passToPass`: tests that pass both times.
   It **refuses** a task if no test goes from fail to pass, if any test fails after the fix, or if the
   patch doesn't apply cleanly. It writes the following into `content/scikit-learn/<slug>/`:
   - `task.json`;
   - `before/<path>` (byte-identical to the 1.8.0 file);
   - `tests/<path>` (the PR's test file);
   - `solution/<path>` and `fix.diff` (the real fix, used by CI and shown only after solving).
   The output is deterministic: sorted keys, LF line endings, no timestamps. scikit-learn's BSD-3 license
   is copied in as `content/scikit-learn/LICENSE`.
   · done when: the 5 task folders exist, and running the builder twice changes nothing (`git diff` empty).
   · checked by: Vitest tests of the sorting and refusal rules on small fake outcomes, and a test that every
     `task.json` is complete and points to files that exist.

6. **The words: what each task teaches and the real issue context (written by hand, checked against the
   source).** Files: `content/scikit-learn/<slug>/about.json` (title, teaches, summary, quotes with URLs,
   where to look, PR link) and `content/scikit-learn/<slug>/source.md` (the issue and PR text the
   quotes come from, with the URL and the date it was fetched). Suggested order and focus (to be confirmed
   against the real issues):
   1. #33127 `_weighted_percentile` off-by-one (1-line fix): edge cases in a numerical helper
   2. #33643 image patch at full size (+3/−1): boundary conditions in array shapes
   3. #33176 `StratifiedGroupKFold` too many splits (+8): validating input and giving clear errors
   4. #34815 `fetch_file` path safety (+12/−2): treating file names as untrusted input
   5. #33362 empty `Pipeline` and `dir()` (+23/−3): Python's attribute protocol in an estimator
   · done when: all 5 have `about.json`.
   · checked by: a Vitest test that every quote appears word for word in that task's `source.md` and that
     every link is a `github.com/scikit-learn/scikit-learn` link; the reviewer reads each summary against
     the issue.

7. **CI check: every real fix passes and every "before" fails.** Files: `apps/web/scripts/check-sklearn-tasks.ts`
   (adapted from Casebench 1's `check-practice-tasks.ts`) and a second job, "tasks", in
   `.github/workflows/ci.yml` that caches the Pyodide tarball by its SHA-256.
   For each task, it checks that:
   - the `before` file matches the file inside the scikit-learn 1.8.0 package;
   - on `before`, every `failToPass` test fails and every `passToPass` test passes;
   - with `solution`, every required test passes.
   · done when: the job is green on the PR, and a deliberately broken task (e.g. a wrong test id) turns it
     red. Both runs are linked in the PR.

8. **The path page and saved progress.** Files: `apps/web/lib/progress.ts`, which saves progress and
   drafts in localStorage (`casebench2.progress.v1`, `casebench2.draft.v1.<slug>`). Every read and write
   is wrapped so that a blocked or corrupt store means "start fresh" and never a crash. Also
   `apps/web/app/page.tsx`, `apps/web/app/scikit-learn/page.tsx` and `apps/web/lib/tasks.ts`, which reads
   the content folder at build time.
   · done when: the path lists 5 tasks with statuses.
   · checked by: Vitest tests for progress (save, read back, corrupt data, storage throwing).

9. **The task page.** Files: `apps/web/app/scikit-learn/[slug]/page.tsx` (page exports only, engineer
   lesson), `apps/web/components/task/TaskWorkspace.tsx` (CodeMirror editor as in Casebench 1, the two
   buttons, results, reset, draft, solved state, the real fix after solving).
   · done when: a student can solve a task and see it marked Solved on the path.
   · checked by: unit tests for "solved only when every required test passed" (ported from Casebench 1's
     `submission.ts` rules).

10. **End-to-end check in a real browser + build log.** Files: `apps/web/e2e/sklearn-track.mjs`
    (Playwright, run by hand; it is not in CI, because it needs Chromium and the 39 MB download),
    `docs/build-log/02-scikit-learn-track.md` and a row in the build log README.
    The check:
    1. open the path;
    2. open #33127 and run the tests (they fail, showing the real assertion);
    3. paste in the real fix and press "Check my fix" (all pass, Solved);
    4. go back to the path (it shows "1 of 5 solved") and reload (still solved);
    5. break the syntax (you see `SyntaxError` with the line);
    6. at phone width (390 px), nothing scrolls sideways.

    Also repeat it on a second task (#34815) so we don't trust a single success.
    · done when: the script passes and its output is in the build log.

**Suggested PRs (about 5):**
1. step 1
2. steps 2–4
3. steps 5–7
4. steps 8–9
5. step 10

## Risk check first
- **Biggest unknown: does it work in a real browser?** Everything so far ran in Node. → Step 1 runs a task
  in headless Chromium in a module worker, with the self-hosted files. → **If Pyodide or scikit-learn
  won't load in the browser:** stop and bring it back. The only real fallback is the server sandbox the
  decision ruled out for now, and that is a change of direction for the owner. **If only "edits take
  effect" fails** (clearing modules): restart Python for every run instead. It's slower (about 10–15 s per
  run) but still works, and we'd report it.
- **Already checked by the planner (Node, Pyodide 314.0.7):** clearing *all* `sklearn` modules, compiled
  parts included, between runs works. For #33127, #33176, #33643, #34815 and #33362 the issue's tests went
  fail → pass → fail in one Python. The first run took 10–11 s and later runs 1.8–4.3 s, which matches the
  researcher's 1.3–4 s. The script is `scratchpad/planner/targeted.mjs`.
  **Not yet checked: a warm "Check my fix" on a whole test file.** Cold, these took 13–40 s in the
  researcher's outputs (`out_*_before.json`); step 1 measures it.

## Not in this section
- **AI coach, "explain your change", review practice:** section 2 (roadmap). This section is the track and
  the test engine the coach will sit on. The vision says the coach must carry real weight; that comes
  next, not here.
- **Accounts, a database, server-side records:** not needed for one student practising. Progress is
  per browser and is lost if browser data is cleared; the page says so.
- **Trusted grading:** results are checked in the browser and could be faked, as in Casebench 1. A server
  sandbox is the long-term answer (decisions.md).
- **Showing the maintainers' review comments inside the app:** we link to the real PR after solving. Pulling
  in the comments themselves belongs with the coach (section 2).
- **Tasks that need extra packages** (#33491 needs pandas) and the next ones (#32592): this adds about 10 MB
  and another check. Easy to add once five work.
- **Fixes that change several files, editing tests, other scikit-learn versions:** Pyodide ships only
  1.8.0, and one file keeps the first version simple.
- **Forks, branches, pull requests:** section 3.
- **Deploying it publicly:** deploying publishes outside our repo, so the owner is asked first. The
  milestone demo runs locally.
- **The browser test in CI:** it needs Chromium and a 39 MB download on every run. CI checks the tasks
  themselves (step 7); the browser test is run by hand and logged.

## Risks
- **Real browser not yet tested:** handled by step 1, before anything else.
- **39 MB first download:** files are served under a versioned path with long cache headers, so it happens
  once. A slow connection will still wait; the page shows progress.
- **"Check my fix" is slow on big test files** (about 40 s for #33176). Mitigations: the quick button for the
  issue's tests, and a 120 s limit before Python restarts.
- **Stuck on scikit-learn 1.8.0** until Pyodide updates; tasks are "1.8.0 + the real fix". Known and logged.
- **Our summaries could get the issue wrong:** every quote must be found word for word in the saved
  source, and the reviewer checks the summaries.
- **CI depends on downloading a 322 MB tarball from GitHub:** it's cached by checksum. If GitHub is slow,
  the "tasks" job can be re-run; the main job doesn't need it.
- **Faked results:** acceptable for now, since progress is the student's own and isn't sent anywhere.

## Choices made (for the team lead to log as "Decided (team lead)")
1. **One app, three pages:** home → `/scikit-learn` path → `/scikit-learn/<task>`. Static pages built
   from committed content; no API routes.
2. **Progress and drafts in localStorage** (`casebench2.progress.v1`), versioned keys, safe to lose. No
   database or accounts.
3. **Two run buttons:** "Run the issue's tests" (fast, for working) and "Check my fix" (all required tests,
   the only way to solve). "Solved" means every `failToPass` and `passToPass` test in the PR's test file
   passes.
4. **Use Pyodide's own packages (pytest 9.0.2 included), self-hosted from the 314.0.7 release tarball**,
   pinned by the tarball's SHA-256 and each file's SHA-256 from `pyodide-lock.json`. No CDN and no PyPI.
   One copy of the files serves both the browser and the CI check.
5. **The student's file is written over the installed scikit-learn file**, the original is put back
   between runs, and all `sklearn` modules are cleared before each run.
6. **Content layout:** `content/scikit-learn/<slug>/`. Generated files (`task.json`, `before/`, `tests/`,
   `solution/`, `fix.diff`) are kept apart from hand-written ones (`about.json`, `source.md`), so
   rebuilding never overwrites our words.
7. **The real fix is committed** (unlike Casebench 1), so CI can prove it passes without cloning
   scikit-learn. It's public on GitHub anyway. The app shows it only after the task is solved; it is not
   hidden from someone determined to look.
8. **Suggested order is by size of the real fix** (1 line → 23 lines), as in Casebench 1.
9. **Every quote is checked word for word** against a saved copy of the issue text, so the context can't be
   invented.
10. **The browser test runs by hand, not in CI;** CI runs the task check in a separate cached job.
11. **Deploying is left to the owner** (it publishes outside the repo).

## Decisions needed from the owner
None for building: the defaults are chosen above, under the owner's delegation. At the milestone: **whether
and where to deploy** (publishing).

## Size
Medium to large: about 5 PRs. Step 1 is about half a day; it decides whether the rest goes ahead as
planned.

## Lessons
- **The "before" run takes much longer than re-runs, so measure both.** In Node, the first run of a task
  took 10–11 s (loading scikit-learn and pytest's first collection) and later runs 1.8–4.3 s. A plan that
  quotes only one number sets the wrong expectation for the student's first click.
  (planner check, `scratchpad/planner/targeted.mjs`)
- **A full test file is a different cost from the issue's tests** (13–40 s vs 2–4 s here), so "solved"
  and "try my change" deserve different buttons. (`research/spike/out_*_before.json` vs the planner check)
- **Research logs can hold stale runs.** `spike/rl.log` ends in a `PluginValidationError` from an older
  version of `reload.mjs`; the current script works. Re-run a script rather than trusting its log.
