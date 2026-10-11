# Plan: Section 2, a first draft of the AI coach

**Status:** a draft the owner will use and give feedback on. **Decided (owner),** 2026-10-11: *"deliver a draft of what
the most realistic AI coach would be like… we can make changes as I use it and give feedback."*

## Goal

After a student fixes a bug, the coach gets them ready to open a real scikit-learn pull request. It does what a
careful maintainer would do before spending their own time on the PR:
1. check the change follows the project's rules;
2. make the student write the PR the way scikit-learn asks;
3. make the student **explain** the change, since scikit-learn's Automated Contributions Policy requires
   contributors to understand and be able to explain every change.

The coach never writes the fix for the student.

## Why this is realistic (based on scikit-learn's real rules, from the clone at `102e5daf`)

- **The PR template** (`.github/PULL_REQUEST_TEMPLATE.md`) has five sections: Reference Issues/PRs; What does this
  implement/fix? Explain your changes; Introduce yourself; AI usage disclosure; Any other comments.
- **Changelog fragments** (`doc/whats_new/upcoming_changes/README.md`): a file named
  `<PR>.<type>.rst`, in the folder for the module, holding a single ReST bullet that ends with `By :user:`…``.
- **Style:** ruff with `line-length = 88` (`pyproject.toml`).
- **Contributing guide** (`doc/developers/contributing.rst`): the PR checklist and the Automated Contributions
  Policy.

## What the student sees: a "Prepare your pull request" panel on the task page

It unlocks after "Solved". There are 4 stages, each usable **without any AI**:

1. **Automatic checks**, no AI. Each check cites the rule it comes from:
   - **Scope:** lines changed against the real fix's size; edits outside the function in "where to look";
     unrelated lines changed.
   - **Style:** lines over 88 characters, trailing whitespace, tabs, leftover `print(` or `breakpoint()`,
     commented-out code.
   - **Tests:** "Check my fix" passed (already true once solved).
2. **Write your PR.** A form with the real template's sections, plus a changelog fragment editor. It shows the
   correct file name and folder for this task (e.g. `sklearn.utils/33127.fix.rst`). Format checks, no AI:
   - one bullet starting with `- `;
   - ends with `By :user:`…``;
   - mentions the class or function with a ReST role;
   - the "Reference Issues/PRs" field isn't empty;
   - the AI usage disclosure is filled in.
3. **Explain your change.** 3 questions per task, written by the team in `content/scikit-learn/<slug>/coach.json`,
   each with a rubric of key points taken from the real fix and the sources. For example: *what input breaks the
   old code? why this exact change? what does the new test check?*
   - **Without AI:** after answering, the student sees the key points and ticks the ones they covered
     (self-check).
4. **AI review**, optional, with **the student's own Anthropic API key**:
   - The key is pasted on the page, kept in this browser's localStorage, and sent only to `api.anthropic.com`.
   - One request reviews everything: the diff against 1.8.0, the PR text, the changelog, the answers, and the
     contributing-rule passages that **retrieval** found as relevant (BM25 over scikit-learn's contributing docs,
     reusing `packages/team-memory`'s `splitPassages`/`buildIndex`; the owner's RAG learning goal).
   - **What comes back:** structured JSON with
     - review comments, each with a severity, the line if any, and the rule passage it cites;
     - for each answer, the rubric points covered or missed and one follow-up question;
     - an overall "ready / needs work" verdict with the reasons.
   - **What is shown with it:** the tokens used, the cost estimate and the time taken.
   - **Feedback:** a thumbs up or down on each comment, saved locally.
   - **"Download coach log" (JSON)** collects every review with the inputs, outputs, model, tokens, latency and
     the student's ratings. This is the seed of the owner's own evaluation of the coach (the data-science part).

## Technical choices (Decided (team lead), reversible)

- **Model:** `claude-opus-5-5`, the current default model. Effort `medium` (also its default; set
  explicitly). Thinking is adaptive (always on for this model, so `thinking` is omitted or set to
  `{type: "adaptive"}`).
- **Structured output:** `client.messages.parse` with `output_config.format: zodOutputFormat(schema)`, which
  validates the response against the schema.
- **Safety:** `stop_reason` is checked before reading content. A `refusal` is shown plainly.
- **Refusal fallbacks:** enabled with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
  If the browser path rejects it, drop it and say so.
- **SDK in the browser:** `@anthropic-ai/sdk` with `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
  The engineer confirms the option name in the installed SDK before relying on it.
- **Errors:** typed SDK error classes (AuthenticationError → "this key was rejected", RateLimitError, APIError).
- **Data:**
  - Contributing docs are copied into `content/scikit-learn/contributing/` with the clone commit and BSD-3 licence.
  - The PR-template text comes from the real file.
  - Quotes follow the same honesty rules as section 1: each must match the saved copy word for word.
- **No server, no accounts, no spending by us.** Without a key the coach still works (stages 1–3).

## Steps

1. Content: contributing docs plus `coach.json` for the 5 tasks (questions + rubric points), with tests that
   every rubric point traces to text in `source.md`, `fix.diff` or the docs.
2. Automatic checks (scope, style, PR form, changelog format), as pure functions with unit tests.
3. Retrieval over the contributing docs, with tests that sensible queries find the right rule sections.
4. AI review: request builder, schema, client call and error handling. Unit-test the request builder and response
   handling with a mocked client. No real API call in CI.
5. The panel UI: 4 stages, key handling, ratings, the log download, accessibility, 390 px.
6. End-to-end in Chromium: solve, then go through stages 1–3 with no key. Stage 4 runs against a **mocked**
   API route in the browser, because no real key is available to the team.
7. Build log 03 and a teach-back.

## Not in this draft

- Real GitHub PRs, forks or branches (section 3).
- Real maintainer review comments as examples (blocked from this sandbox).
- A hosted key or server proxy.
- Grading the coach's quality. That's the owner's evaluation, built from the coach log.

## Risks

- **Cost:** each review costs the key owner money. The cost estimate is shown, and the request is kept small:
  only the diff and the retrieved passages, not whole files.
- **Key safety:** a key in localStorage is readable by any script on the page. Say so on the page and recommend a
  key with a low spending limit.
- **Untested against the real API:** the AI layer is untested against the real API until the owner adds a key;
  the hand-over must say this plainly.
