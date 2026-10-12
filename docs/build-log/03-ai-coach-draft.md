# 03 · A first draft of the AI coach

> **The honest headline: the AI review has never run against the real Anthropic API.** Every test and the
> browser check used a fake (mocked) API that returns a canned answer. Nobody on the team has a key. The
> owner's first real review is the first real test of the AI part, so expect surprises, and keep the
> coach log from it.

## Goal
After a student fixes a bug, get them ready to open a real scikit-learn pull request (PR). The coach does
what a careful maintainer would do before spending their own time on the PR:
1. check the change follows the project's rules;
2. make the student write the PR the way scikit-learn asks;
3. make the student **explain** the change. scikit-learn's Automated Contributions Policy requires
   contributors to understand, and be able to explain, every change.

The coach never writes the fix. This is a **draft**: the owner uses it and gives feedback (decision of
2026-10-11 in `.claude/team/decisions.md`). The plan is `docs/plans/section-2-coach-draft.md`.

## Where we started
- Section 1 (build log 02) delivered five real scikit-learn bugs. A student can fix them in the browser
  and have scikit-learn's own tests mark them "Solved".
- After "Solved" there was nothing: no guidance on what a real PR needs.
- The team had a search engine over its own notes (the librarian, `packages/team-memory`), built for
  build log 01.

**Terms used below:**
- **API key**: a secret string that lets a program use Anthropic's models and bills the key's owner.
- **Token**: the unit models read and write text in (roughly a word piece). Cost is priced per million
  tokens.
- **Rubric**: a fixed list of key points a good answer should contain, written in advance. Here each
  question has a rubric, and each key point is traced to real text (the fix, the tests or the docs).
- **RAG** (retrieval-augmented generation): before asking the model, *retrieve* the relevant documents
  and put them in the request, so the model answers from real sources instead of memory. Here: find the
  scikit-learn rules that matter, and let the model cite only those.
- **BM25**: a classic keyword-search scoring formula, the same family search engines used for decades.
  A passage scores high when it contains the query's words, especially rare words, without being
  rewarded just for being long. No AI is involved.
- **Structured output**: asking the model to reply in an exact JSON shape (a schema) instead of free
  text, so the page can show verdicts and comments reliably. The reply is then checked against the
  schema.
- **Refusal fallback**: a beta API feature (`server-side-fallback-2026-07-01`, `fallbacks: "default"`)
  that lets Anthropic's servers handle a refusal (the model declining a request) with a fallback,
  instead of just returning it. We have never seen it act, because the real API was never called.
- **Mocked API**: a stand-in that answers like the real API with a fixed reply. It tests our code's
  handling, not the model's quality.

## What we built

A **"Prepare your pull request" panel** on the task page. It appears once the task is solved and has four
stages. Stages 1–3 work **without any AI**.

1. **Automatic checks** (`apps/web/lib/coach/checks.ts`). Each check cites the scikit-learn rule it comes
   from:
   - **Scope:** the change's size against the real fix; edits stay inside the function in "where to
     look"; no unrelated reformatting.
   - **Style:** lines at most 88 characters (scikit-learn's ruff setting); no trailing spaces or tabs; no
     leftover `print(`, `breakpoint()` or commented-out code.
   - **Tests:** "Check my fix" passed.
2. **Write your PR.** A form with the five sections of scikit-learn's real PR template, plus a changelog
   fragment editor that shows where the file goes (for #33127:
   `doc/whats_new/upcoming_changes/sklearn.utils/<PR number>.fix.rst`). Format checks:
   - one bullet starting with `- `;
   - ends with ``By :user:`…` ``;
   - names the changed function with a ReST role;
   - "Reference Issues/PRs", the explanation and the AI usage disclosure are filled in.
3. **Explain your change.** Three questions per task:
   - what input breaks the old code;
   - why this exact change;
   - what the new test checks.

   After answering, the student sees the key points and ticks the ones they covered (a self-check).
4. **AI review** (optional, with the student's own Anthropic API key, in the browser). One request
   sends:
   - the student's diff against 1.8.0, the PR text and the changelog fragment;
   - the answers with their key points, and the automatic checks' results;
   - the rule passages retrieval found.

   The model replies in a fixed JSON shape: a "ready / needs work" verdict with reasons; comments,
   each with a severity, where it applies, a line if any and the rule it cites; and for each answer,
   the key points covered and missed plus one follow-up question. The page shows it with the tokens
   used, a cost estimate and the time taken. Each comment gets a thumbs up or down. "Download coach log
   (JSON)" saves every review.

**Files:**
- **Content:**
  - `content/scikit-learn/contributing/`: scikit-learn's own rules, copied unchanged from a clone (the
    commit is in `SOURCE.md`). Holds `contributing.rst`, the PR template, the changelog-fragment README,
    `CONTRIBUTING.md`, `pyproject.toml` and the list of changelog folders.
  - `content/scikit-learn/<slug>/coach.json`: the three questions and their key points for each task.
    Each key point names the exact text it comes from.
- **Logic** (`apps/web/lib/coach/`):
  - `checks.ts`: the automatic checks.
  - `passages.ts`: splits the docs into 340 passages at build time, reusing the librarian's splitter.
  - `retrieval.ts`: BM25 search over those passages in the browser, using the librarian's search.
  - `review.ts`: builds the request, defines the schema, calls the API and handles every outcome.
  - `storage.ts`: the coach's per-task state, the review log and the saved key, in localStorage
    (`casebench2.coach.v1.<slug>`, `casebench2.anthropicKey.v1`).
- **Page:** `apps/web/components/coach/CoachPanel.tsx` (the four stages), added to
  `components/task/TaskWorkspace.tsx`.
- **End-to-end check:** `apps/web/e2e/coach.mjs`, run by hand, with the API mocked.

**How retrieval picks the rules.** Every review asks the rules five fixed questions. They cover PR
scope, AI use and explaining changes, changelog fragments, tests for bug fixes, and referencing issues
(`REVIEW_QUERIES` in `retrieval.ts`). The titles of any automatic checks that failed are added as extra
questions. The top passages are labelled R1, R2, … (at most 8), and the model may cite only those ids.

## Decisions and why
- **The student's own key, in the browser.** There's no server, no accounts and no spending by us.
  *Rejected:* a hosted key or a server proxy, which costs us money and needs accounts. *Trade-off:* a key
  in localStorage can be read by any script on the page. The page says so and recommends a key with a
  low spending limit.
- **Most of the coach works without AI.** The checks, the PR form and the self-check are plain code, so
  they cost nothing and are fully tested. The AI adds judgement on top.
- **One request per review**, holding only the diff and the retrieved passages, not whole files. That
  keeps the cost down.
- **Retrieval (RAG) with BM25, reusing the librarian.** The model cites real rules, and the request stays
  small. *Rejected:* sending all of `contributing.rst` (1,665 lines), which is costlier and gives
  nothing to cite precisely. BM25 was chosen because it already existed in the repo, needs no AI and can
  be tested. Retrieval is also one of the owner's learning goals.
- **Rubrics written by the team and traced to the source.** "Covered / missed" is judged against fixed
  key points, not the model's own idea of a good answer. `apps/web/lib/coach/coachContent.test.ts`
  checks every key point's quoted text appears word for word in its source.
- **Model `claude-opus-5-5`, effort `medium`.** Thinking is adaptive and isn't sent; no temperature is
  sent.
- **`messages.create` instead of `messages.parse`** (a change from the plan, accepted by the team lead).
  In the installed SDK (0.133.0), `.parse` throws as soon as the reply isn't valid JSON. That happens on
  a refusal or an answer cut off at the length limit, so the code could never read *why* it failed.
  Now the code creates the message, checks `stop_reason` first, then validates the text with the same
  schema. A test shows `.parse` throwing.
- **Refusal fallbacks on, with a way out.** If the API rejects the fallback beta with a 400 error, the
  same request is sent once without it, and the log records `fallbacks: "off"`.
- **A downloadable coach log.** It's the raw data for the owner's own evaluation. *Rejected:* building a
  scoring system into the app now. Measuring the coach is the owner's job (see below).

## Problems found along the way
- **`.parse` hid refusals.** See the decision above. The plan assumed `.parse`. Reading the installed SDK
  showed it would turn a refusal into a generic "failed to parse" error.
- **The task page got heavier.** The task page's first-load JavaScript (the code a browser downloads
  before the page works) grew from 269 kB to 362 kB. It now includes the Anthropic SDK, zod (the schema
  library) and the search code. 362 kB was re-checked with `next build` for this entry. The 269 kB
  "before" number is the engineer's. Nothing has been done about it yet.
- **reStructuredText vs markdown.** The librarian splits markdown by headings. scikit-learn's docs are
  reStructuredText, where a title is underlined (`Title` then `=====`). `rstHeadingsToMarkdown` turns
  those into `## Title` and keeps every line number, so citations still point at the right lines.
- **The engineer hit a usage limit mid-task** and resumed after the reset. Nothing had been committed,
  so nothing was lost.

## How it was verified
- `pnpm typecheck` passes. `pnpm test`: **326 passed**, 12 skipped (the skipped ones need Pyodide).
  Re-run for this entry.
- **Unit tests with a fake API** (`apps/web/lib/coach/review.test.ts`). The real SDK runs against a fake
  `fetch`, so nothing leaves the machine. They cover the request's headers and body, a parsed review,
  the 400 retry without the beta, a refusal, a cut-off, a reply in the wrong shape, 401, 429, 500 and a
  network failure.
- **Retrieval tests** (`retrieval.test.ts`). For example, "Can I use AI tools…" finds the Automated
  Contributions Policy, and "unrelated lines" finds the Pull request checklist.
- **Checks tests** (`checks.test.ts`). The real fix of every task passes every code check. Every real
  changelog fragment passes the fragment checks.
- **End-to-end** (`node apps/web/e2e/coach.mjs`, headless Chromium, #33127). The engineer's run passed;
  re-run for this entry: "ALL CHECKS PASSED", 28 checks, "API calls: 2, all mocked". Among them:
  - "stage 1 with the real fix: 7 checks pass, 0 need work", and "a leftover print() added in the
    editor is caught";
  - "a fragment without By :user:`…` is flagged";
  - "self-check: "1 of 3 covered."";
  - the request goes only to `https://api.anthropic.com/v1/messages?beta=true`, carries the key and the
    fallback beta, and holds the diff, the PR text, the fragment and the retrieved rule passages;
  - a 401 shows "This key was rejected. Check it, or create a new one in the Anthropic Console.";
  - removing the key deletes it from localStorage;
  - at 390 px, no stage scrolls sideways;
  - "no other hosts contacted".
- **Careful with the numbers on the review screen.** "5,000 input + 2,000 output tokens · about $0.060
  (estimate) · 0.0 s" comes from the **canned** mock reply. It says nothing about real cost or speed.
  The verdict and comments in the screenshot are canned too.
- **Not yet done:** the reviewer's review of this section is under way; the team lead handed it over
  on 2026-10-12.

### Known limits
- **Never run against the real API** (see the top). Unknowns: whether the request is accepted as built,
  whether the fallback beta works from a browser, the real cost and time per review, and the review
  quality itself.
- **The cost estimate uses prices written in the code** ($4 / $20 per million input / output tokens,
  `PRICE_PER_MTOK` in `review.ts`). It hasn't been compared with a real bill.
- **Key safety:** a key saved in localStorage is readable by any script on the page.
- **The self-check ticks aren't in the coach log.** The log holds the AI's covered/missed, not the
  student's own ticks.
- **The log lives in the browser** until downloaded. Clearing browser data loses it.
- **No real maintainer review comments** as examples: GitHub's PR pages are blocked from this sandbox.
- **Not tested** in Firefox or Safari, or with a real screen reader.

## How the owner can measure the coach
The coach log is a dataset. Download it from stage 4 ("Download coach log (JSON)"); there is one file
per task, `coach-log-<slug>.json`.

**What's in it.** The top level has `format`, `exportedAt`, `task` and `reviews`. Each entry in
`reviews` holds:
- `at` and `slug`: when, and which task;
- `model`;
- `request`: the full prompt, including the diff, the answers and the rubric;
- `rules`: the passages R1… that were sent;
- `outcome`:
  - on success, `review` (verdict, reasons, comments, answers with `covered` and `missed`), `usage`
    (tokens), `costUsd`, `latencyMs` and `fallbacks`;
  - on failure, `kind` (refusal, cut-off, auth, …) and `message`;
- `ratings`: thumbs up or down, by comment index.

**A first evaluation: 20 reviews.**
1. **Make the set.** 4 attempts on each of the 5 tasks. Vary the quality on purpose: one strong
   explanation, one partial, one vague, and one with a deliberate mistake (for example, a line over 88
   characters or a missing changelog bullet).
2. **Label first, then look.** Before reading the coach's answer, mark each key point covered or not in
   your own copy of the answers (a spreadsheet: review, question, point, your label). Labelling blind
   keeps the coach from anchoring you.
3. **Measure:**
   - **Agreement on covered/missed:** across every key point, the share where the coach matches your
     label. Report Cohen's kappa too, since agreement by chance is high when most points are covered.
     Look at the disagreements one by one: is the coach too generous, or too strict?
   - **Verdict agreement:** the coach's "ready / needs work" against your own call, as a 2×2 table. A
     "ready" on an attempt with a planted mistake is the costly error.
   - **Useful comments:** rate every comment, then (thumbs up) ÷ (rated comments). Also count comments
     that cite a rule, and check by hand whether the cited passage really supports the comment.
   - **Cost and time per review:** the median and the maximum of `costUsd` and `latencyMs`. Compare the
     total with your Anthropic Console bill, to check the estimate.
   - **Failures:** how many reviews came back with a `kind` instead of a review.
4. **Write it down.** One table and three example disagreements is enough to decide what to change
   first: the prompt, the rubric, the retrieved rules, or the model or effort.

Starting point in pandas:
```python
import json, glob
import pandas as pd

rows, points = [], []
for f in glob.glob("coach-log-*.json"):
    for r in json.load(open(f))["reviews"]:
        o = r["outcome"]
        rev = o.get("review") if o["ok"] else None
        rows.append({
            "task": r["slug"], "at": r["at"], "ok": o["ok"], "error": o.get("kind"),
            "verdict": rev["verdict"] if rev else None,
            "cost_usd": o.get("costUsd"), "latency_s": o["latencyMs"] / 1000,
            "comments": len(rev["comments"]) if rev else 0,
            "up": sum(v == "up" for v in r["ratings"].values()),
            "down": sum(v == "down" for v in r["ratings"].values()),
        })
        for a in (rev["answers"] if rev else []):
            for p in a["covered"]:
                points.append({"task": r["slug"], "at": r["at"], "question": a["questionId"], "point": p, "coach": True})
            for p in a["missed"]:
                points.append({"task": r["slug"], "at": r["at"], "question": a["questionId"], "point": p, "coach": False})

reviews, coach_points = pd.DataFrame(rows), pd.DataFrame(points)
# Join coach_points with your own labels on (task, at, question, point), then compute agreement.
```

## Explain it in an interview
"After a student fixes a real scikit-learn bug, a coach prepares them to open the pull request the way
the maintainers ask. Most of it is plain code: style and scope checks, the project's own PR template and
changelog rules, and three 'explain your change' questions with rubrics traced to the real fix. The
optional AI review is retrieval-augmented: BM25 search picks the relevant passages of scikit-learn's
contributing guide, and the model must cite those passages and answer in a fixed JSON schema. I chose to
check the stop reason before parsing, so a refusal is reported as a refusal, not a parse error. It hasn't
met the real API yet, so I designed it to log every review, and my first job is to evaluate it like any
model: label 20 reviews myself and measure agreement, useful comments and cost per review."

## Try it yourself
```bash
pnpm install
pnpm --filter @casebench2/web pyodide
pnpm dev     # open http://localhost:3000/scikit-learn, solve a task, then scroll to "Prepare your pull request"

pnpm test    # includes the coach's checks, retrieval and review tests

# The end-to-end check (mocked API; needs Chromium and Playwright):
pnpm --filter @casebench2/web build
node apps/web/e2e/coach.mjs
```
Things to try:
- Add a `print(` to your fix and watch stage 1 flag it.
- Leave out ``By :user:`…` `` in the changelog and watch stage 2 flag it.
- With a key that has a low spending limit, run one review. That is the first real test. Then download
  the coach log.

## Teach-back
1. What does retrieval (RAG) add to the AI review, and why is BM25 good enough here?
2. Why does the code use `messages.create` and check `stop_reason` before reading the answer?
3. The coach says a student "covered" a key point. How would you find out whether to trust that?

<details>
<summary>Model answers</summary>

1. It finds the few scikit-learn rules that matter and puts them in the request. The model can cite
   real, numbered passages instead of inventing rules, and the request stays small and cheap. BM25 is
   enough because the rules use predictable words (changelog, unrelated lines, AI tools); it needs no AI
   and it's easy to test.
2. A refusal or a cut-off answer isn't valid JSON. `.parse` throws a generic error before you can see
   why. Checking `stop_reason` first lets the page say "the model declined" or "it was cut off". Only
   then is the text checked against the schema.
3. Treat it as a classifier and compare it with ground truth. Label the key points yourself, before
   reading the coach's answer, on a set of reviews (say 20). Then measure agreement (with Cohen's kappa)
   and read the disagreements. The coach log has every input and output needed.

</details>
