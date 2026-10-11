# 01 · Starting Casebench 2

## Goal
Start a fresh repo for Casebench 2 without losing what worked in Casebench 1: the AI dev team and the
librarian (the search over the team's notes).

## Where we started
Casebench 1 (`kstc707/casebench`) had real open-source practice tasks with tests running in the browser,
but the owner felt it was "LeetCode with no context or path". After a conversation with the cofounder
agent, Casebench 2 became a learning path from a first fork to a first merged pull request (see
`.claude/team/vision-anchor.md`).

## What we built
- `.claude/agents/`, `.claude/skills/rpi`, `.claude/skills/talk`: the dev team, copied unchanged.
- `.claude/team/`:
  - lessons and glossary carried over
  - a new `decisions.md`, `roadmap.md` and journal
  - a draft `vision-anchor.md` for the owner to rewrite
  - the cofounder's notebook (`chats/cofounder.md`)
- `packages/team-memory/`: the librarian. `pnpm team:ask "…"` lists the closest passages in the notes,
  with `file:line`.
- Root files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.mts`, CI in
  `.github/workflows/ci.yml` (install, typecheck, test).

## Decisions and why
- **Carry over the team and the librarian, not the app.** The app's product direction changed. The way
  we build didn't.
- **Dropped Casebench 1's evaluation questions** (`eval/*.json`, `golden.test.ts`) and the tests that
  searched Casebench 1's notes. They measured answers to questions about Casebench 1; in a new memory
  they'd fail for the wrong reason. New ones get written once Casebench 2's notes have content.
- **Built locally first.** The GitHub app wasn't allowed to create repositories, so the scaffold was
  built locally and backed up on a branch until the owner creates `casebench2`.

## Problems found along the way
- 5 librarian tests failed after the move, all because they searched for Casebench 1 content (PR #8,
  AlaSQL, `anthropicProvider.ts`). They were removed. The search logic itself was unchanged.

## How it was verified
- `pnpm typecheck`: passes.
- `pnpm test`: 4 files, 129 tests pass.
- `pnpm -s team:ask "why scikit-learn first"`: returns the scikit-learn decision as the top passage.

## Explain it in an interview
"I restarted the product but kept the process. The AI team's roles, its lessons and its searchable memory
moved to the new repo; the evaluation sets didn't, because an evaluation is only valid on the data it
was written for."

## Try it yourself
```bash
pnpm install
pnpm test
pnpm team:ask "what did the owner delegate to the team?"
```
