# The Casebench dev team

Six AI agents that build Casebench with the owner (Sai), using **Research → Plan → Implement (RPI)**,
plus a **cofounder** the owner thinks things through with.
They live in `.claude/agents/` and are run by the main Claude Code session, the **team lead**,
through the `/rpi` workflow (`.claude/skills/rpi/SKILL.md`).

The point of the team is **control and quality**: every change starts from research, goes through a plan
the owner approves, is reviewed and tested by someone other than whoever wrote it, and is written up so
the owner can explain it.

## Who does what

| Agent | Job | Can change files? |
|---|---|---|
| `researcher` | Finds facts: how the code works today, competitors, libraries, risks. Cites sources. | No |
| `planner` | Turns research into a small, step-by-step plan **for the owner to approve**. | No |
| `engineer` | Implements **one approved plan step** at a time, with tests. | Yes |
| `reviewer` | Reads the diff like a skeptical senior engineer: bugs, security, scope creep. | No |
| `tester` | Proves it works: runs checks, clicks through in a real browser, tries the failure paths. | Test scripts only |
| `docs-writer` | Writes the build log and a plain-language summary the owner can present. | Docs only |
| `cofounder` | **The owner's thinking partner**, not a builder: challenges ideas, brings evidence, keeps notes of every conversation. | Its own notes only |

## Talking to one team member directly

`/talk <agent>` (e.g. `/talk cofounder`, `/talk reviewer`) starts a one-on-one chat that works anywhere,
including web and mobile. The agent greets you, remembers your last chat from `chats/<agent>.md`, and
writes a short note when you say bye. In a terminal, `claude --agent cofounder` runs a whole session as
that agent.

## The flow

```
owner's goal
   │
   ▼
1. RESEARCH   researcher ──► findings + open questions
   │
   ▼
2. PLAN       planner ──► plan (steps, what's NOT included, risks, first risk check)
   │
   ▼  ⛔ STOP: the owner approves, edits or rejects the plan. Nothing is built before this.
   │
3. IMPLEMENT  for each step:  engineer ──► reviewer ──► tester
   │                              ▲            │           │
   │                              └── fixes ◄──┴───────────┘
   ▼
4. DOCUMENT   docs-writer ──► build log + summary
   │
   ▼
5. RETRO      every agent proposes lessons ──► team lead records them in lessons/
   │
   ▼  ⛔ STOP: the owner decides whether to merge.
```

## Shared resources (every agent reads these first)

| File | What it is | Who may change it |
|---|---|---|
| `vision-anchor.md` | What Casebench is for, in the owner's own words | **Only the owner** |
| `decisions.md` | Every product decision: what, when, why, and what it replaced | Team lead, **only after the owner agrees** |
| `glossary.md` | Terms we use, so agents and the owner mean the same thing | Team lead |
| `lessons/shared.md` | Lessons that apply to everyone | Team lead (from retros) |
| `lessons/<agent>.md` | Each agent's own lessons | Team lead (from retros) |
| `journal/YYYY-MM-DD.md` | The build journal: how each day's work went, stage by stage | Team lead, as work happens |
| `chats/<agent>.md` | Notes from one-on-one chats with that agent: how it remembers you | The agent, at the end of each chat |
| `/CLAUDE.md` | Repo conventions (build logs, tests before pushing, …) | Team lead, with the owner |

Before asking the owner about past decisions or lessons, run `pnpm team:ask "…"`: it lists the closest
passages in these notes with `file:line`. Check whether they answer it. For structured output use
`pnpm -s team:ask "…" --json` and read `label` first ("closest" or "nothing related"); an error comes back
as `{"error", "exitCode"}`. (`-s` keeps pnpm's own lines out of stdout but reports every failure as exit 1.)

## How the team evolves

1. **Every agent ends its report with "Lessons":** 0–3 specific, reusable things it learned, each with
   the evidence. For example: "Next.js bundles web workers as classic scripts, and Pyodide refuses those:
   serve the worker unbundled. Seen in practice mode, Oct 2026."
2. **In the retro, the team lead** adds the useful ones to `lessons/<agent>.md` (or `shared.md`), merging
   duplicates and deleting lessons that turned out wrong. Each lesson stays one or two lines.
3. **Agents read their lessons before every task.** That's how the team gets better instead of repeating
   mistakes.
4. **New roles are added when a gap shows up,** e.g. a `designer` agent once UI work grows, or a
   `security` agent once real code runs on a server. Add a file in `.claude/agents/` and a lessons file,
   then record the decision.
5. **The owner reviews the lessons** now and then, since they're short. A lesson the owner disagrees with
   gets removed.

## Rules for the whole team

- **The owner is in control.** No code before an approved plan, no merge without the owner, no change
  to `vision-anchor.md` by an agent.
- **Never invent facts, metrics or results.** If something wasn't measured or checked, say so.
- **Small steps.** One plan step per engineer run, so each change is small enough to review and explain.
- **Say what's not done.** Every report lists known limits and what was skipped.
- **Plain language.** The owner has a data-analysis background and must be able to present every part of this.
