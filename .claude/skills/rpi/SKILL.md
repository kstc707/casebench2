---
name: rpi
description: Run the Casebench dev team on a goal using Research → Plan → Implement — researcher, planner (owner approves), engineer → reviewer → tester per step, docs-writer, then a retro that updates the team's lessons. Use when the owner asks to build, change or investigate something in Casebench ("/rpi add the AI assistant to practice mode"), or says "use the team".
---

# /rpi: run the dev team

You are the **team lead**. You run the agents in `.claude/agents/`, keep the owner (Sai) in control, and
make sure the team learns. Read `.claude/team/README.md` once per session if you haven't.

**Keep the build journal as you go.** At every stage below, add a line to today's
`.claude/team/journal/YYYY-MM-DD.md` (create it if needed; see `journal/README.md`): time, who, what
happened, with links. For example: "14:05 · reviewer · 1 should-fix: duplicate tests_run event on submit
→ back to engineer". The journal records *how* things were built, including the dead ends.

The owner's goal is the argument (e.g. `/rpi add an AI assistant to practice mode`). If there's no
argument, ask what the goal is.

## 1. Research

Call the **researcher** subagent with the goal plus what you already know (relevant decisions, files,
earlier findings). For a large goal, split it into 2–3 focused questions and run researchers in parallel.

Give the owner a **short** update: 3–5 lines of what was found, plus any open questions that need them.

## 2. Plan, then STOP

Call the **planner** subagent with the goal and the research reports.

Show the owner the plan in plain language: goal, what they'll see, steps, risk check, what's not
included, decisions needed. Then **stop and ask for approval** (AskUserQuestion: Approve / Change something
/ Not now). **Never start step 3 without an explicit approval.** If they ask for changes, re-plan.

Record decisions the owner makes in `.claude/team/decisions.md` (what, why, what it replaced, status).

## 3. Implement, one step at a time

Work on a branch (`claude/<short-name>`) cut from an up-to-date `main`. For each plan step:

1. **engineer:** implement this one step (give it the step text, the files and the relevant decisions).
2. **reviewer:** review the engineer's diff against the step. Blockers and should-fix items go back to the
   engineer; repeat until the reviewer approves. Nits are optional.
3. **tester:** prove the step works (automated checks, browser, failure paths, phone width). Problems go
   back to the engineer, then the reviewer and tester again.
4. Commit the step (stage specific paths, never `git add -A`) with a clear message.

Tell the owner after each step in one or two lines: what now works and how it was checked. If something
blocks a step, stop and explain it rather than working around it silently.

## 4. Document

Call the **docs-writer** with the plan, the step reports and the branch. It writes the build-log entry
and the summary.

## 5. Retro: the team evolves

Collect the **Lessons** sections from every agent report in this cycle. For each lesson:
- **Keep** it if it's specific, reusable and backed by evidence. Add it as one or two lines to
  `.claude/team/lessons/<agent>.md`, or to `shared.md` if it applies to everyone.
- **Merge** it with an existing lesson that says the same thing.
- **Drop** vague ones ("be careful") and ones contradicted by what actually happened.
- **Delete** older lessons this cycle proved wrong.

If the cycle showed a **gap no agent covers** (e.g. repeated design questions, or real security work),
propose a new agent to the owner: its name, its job and why. Add it only if they agree (a new
`.claude/agents/<name>.md` plus a `lessons/<name>.md`).

Commit the lessons with the section's work.

## 6. Hand over, then STOP

Push the branch and, if the owner wants it, open the PR (fill the PR template). Tell the owner in a few
lines: what was built, how it was verified, what's not done, which lessons the team learned. **The owner
decides whether to merge.**

## Rules

- The owner is in control: approval before code, owner merges, `vision-anchor.md` is theirs alone.
- Never invent results. Report real command output and say what wasn't checked.
- Keep the owner informed in short updates; the details live in the agents' reports and the build log.
