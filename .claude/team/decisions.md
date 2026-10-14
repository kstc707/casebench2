# Decisions log

Every product decision, newest first. Each entry: **what**, **why**, **what it replaced or ruled out**,
and **status**. "Decided (team lead)" means the team chose a default under the owner's delegation; the
owner can reverse any of these, and the reversal is logged here too.

Casebench 1's history lives in the `kstc707/casebench` repo (`.claude/team/decisions.md`).

---

### 2026-10-12 · The coach's AI review uses Gemini's free tier by default; Claude stays an option · **Decided (owner)**
- **What:** the owner can't get an Anthropic API key, so the AI review defaults to a free Gemini model,
  using the student's own key from Google AI Studio. The Claude path stays as an option for anyone who has a
  key.
- **Why (owner):** *"use a gemini free model can't get api"*.
- **Trade-offs:**
  - On the free tier Google may use prompts to improve its products. Here that means the student's code
    and answers, so the page must say so.
  - Free models get retired (lesson from Casebench 1), so the model name lives in one config place and
    the page lists the models the key can actually use.

### 2026-10-12 · One narrow exception to "never string-match error messages" · **Decided (team lead)**
- **What:** the coach retries without refusal fallbacks only when a 400's message mentions fallback or beta.
  The SDK has no typed error for "this beta isn't accepted". The exception is documented in the code, and
  the first error is logged.
- **Revisit:** after the owner's first real review shows what the API actually returns.

### 2026-10-11 · The team builds a first draft of the AI coach for the owner to use and react to · **Decided (owner)**
- **What:** the team builds a draft coach (plan: `docs/plans/section-2-coach-draft.md`). The owner uses it,
  gives feedback, and owns measuring it through the coach log the draft records.
- **Why (owner):** *"deliver a draft of what the most realistic AI coach would be like… we can make changes as
  I use it and give feedback."*
- **Replaces:** the roadmap note that the owner builds the coach from scratch.
- **Team-lead choices inside it:**
  - the AI review is optional and uses the student's own Anthropic API key, in the browser, so we don't spend
    money;
  - model `claude-opus-5-5` at effort `medium`, structured output;
  - retrieval reuses the librarian's BM25.

### 2026-10-11 · Section 1 plan: how the scikit-learn track is built · **Decided (team lead)**
- **Plan:** `docs/plans/section-1-scikit-learn-track.md` (10 steps, about 5 PRs). Step 1 is a real-browser
  risk check; if Pyodide or scikit-learn won't load in a browser, the team stops and asks the owner.
- **Choices:**
  - **Pages:** one app with three static pages: home → `/scikit-learn` → `/scikit-learn/<task>`.
  - **Storage:** progress and drafts live in the browser (localStorage). No accounts, no database.
  - **Two buttons:** "Run the issue's tests" (fast) and "Check my fix" (every required test, the only
    way to solve).
  - **Packages:** Pyodide's own, self-hosted from the 314.0.7 release and pinned by SHA-256. No CDN, no
    PyPI.
  - **Content:** under `content/scikit-learn/<slug>/`, with generated files kept apart from our
    hand-written words.
  - **Quotes:** every quote from a real issue is checked word for word against a saved copy.
  - **The real fix is committed** so CI can prove it passes. It's shown only after solving.
  - **Testing:** the browser test runs by hand, while CI checks every task in a separate job.
- **Left to the owner:** whether and where to deploy (publishing).

### 2026-10-11 · scikit-learn track runs in the browser on Pyodide 314.0.7 (scikit-learn 1.8.0) · **Decided (team lead)**
- **What:** section 1 keeps Casebench 1's approach: students' edits are tested by scikit-learn's own tests
  inside Pyodide in the browser. Tasks are built as "scikit-learn 1.8.0 + the real PR's change", preferring
  fixes merged after 1.8.0, where the bug is genuinely in the shipped code.
- **First five tasks:** PRs #33362 (empty `Pipeline` and `dir()`), #33176 (`StratifiedGroupKFold` too many
  splits), #33127 (`_weighted_percentile` off-by-one), #33643 (image patch at full size), #34815
  (`fetch_file` path safety). Next: #33491, #32592.
- **Evidence:** the researcher ran 10 real merged PRs in Node with Pyodide. Each PR's tests fail on the
  "before" code and pass after the real fix, with no other test in the file breaking. An edit re-tests in
  about 1.3–4 s. Outputs are in the research scratch folder.
- **Known limits:**
  - **Not yet tested in a real browser.**
  - First download is about 39–44 MB.
  - Stuck on scikit-learn 1.8.0 until Pyodide updates.
  - Results checked in the browser can be faked (as in Casebench 1).
- **Ruled out for now:** a server sandbox. It's still the long-term answer for trusted grading and for
  Hugging Face.

### 2026-10-11 · The team builds on its own; the owner steers at milestones · **Decided (owner)**
- **What:** the team no longer stops to ask questions it can answer itself. It picks sensible defaults,
  records each one here so it can be reversed, and keeps building. The owner reviews at **milestones**: a
  working demo, a plain-language explanation and a short teach-back.
- **The team still stops for:** a fork in the vision, anything that spends money or publishes outside our
  repo (accounts, paid APIs, contacting people), and anything that can't be undone.
- **Why (owner):** *"my goal here is to have an app what I desire as soon as possible, not also being the
  one that's stopping a program because you're asking the questions that you already know answers to."*
  The owner still wants to understand everything, which the milestone explanations cover.
- **Replaces:** Casebench 1's rule that every plan waits for the owner's approval before any code.

### 2026-10-11 · First track: scikit-learn · **Decided (team lead)**
- **What:** the first learning track uses real, already-merged scikit-learn changes. Hugging Face, then
  LangChain, follow as later stages of a "data science → AI engineering" path.
- **Why:** the owner wants data science and AI engineering (*"learn Hugging Face, LangChain, and what a
  proper data scientist does"*). scikit-learn is the data-science foundation, is known for welcoming
  newcomers, and is expected to run in the browser (Pyodide ships it), so Casebench 1's in-browser test
  engine may be reusable. That last point is **unverified**: section 1 research checks it first.
- **Ruled out for the first track:** LangChain (moves fast; maintainers are strict about AI pull requests),
  and Hugging Face (likely needs a server sandbox).

### 2026-10-11 · The student is the main customer; maintainers are partners · **Decided (owner)**
- **What:** Casebench 2 is built for students like Sai: people who know some code but have never
  contributed. Maintainers' written standards become the curriculum, and an AI coach prepares students
  before they submit anything.
- **Why (owner):** *"I still feel the student, which is me, is the main customer… I want to be able to do
  what I'm building."*
- **Ruled out:** a maintainer-side pull-request review bot (crowded: CodeRabbit, Cubic, triage tools,
  GitHub itself).

### 2026-10-11 · Start fresh in a new repo; carry over the dev team and librarian · **Decided (owner)**
- **What:** Casebench 2 is a new public repo (`casebench2`). The dev team (agents, `/rpi`, `/talk`,
  lessons) and the librarian (`pnpm team:ask`) carry over. Casebench 1's evaluation question sets stay
  behind because they test Casebench 1's notes. New ones get written once this memory has content.
- **Why (owner):** *"case bench 2 is completely different."* Version 1 had real tasks but "no context, no
  path".

### Open ideas (not decisions)
- **Rebuild first, then contribute:** students build a small version of a tool (e.g. a mini
  cross-validation helper) to understand it, then contribute to the real project. From the owner's idea of
  forking interesting projects. Cofounder's view: rebuilding teaches, but upstream merges are the proof.
