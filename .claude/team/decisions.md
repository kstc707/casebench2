# Decisions log

Every product decision, newest first. Each entry: **what**, **why**, **what it replaced or ruled out**,
and **status**. "Decided (team lead)" means the team chose a default under the owner's delegation; the
owner can reverse any of these, and the reversal is logged here too.

Casebench 1's history lives in the `kstc707/casebench` repo (`.claude/team/decisions.md`).

---

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
