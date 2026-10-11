# Working on Casebench 2

Casebench 2 teaches people who know some code but have never contributed how real open-source projects
work, and coaches them, using each project's own standards, from their first fork to their first merged
pull request. The vision is in `.claude/team/vision-anchor.md` (the owner's words; only the owner edits it).

The owner (Sai) presents this project in interviews and must be able to explain every part of it.
Documentation is part of the deliverable.

## Every section gets a build-log entry

For each meaningful change, add `docs/build-log/NN-short-name.md` with these sections: Goal · Where we
started · What we built (with file paths) · Decisions and why (with rejected alternatives) · Problems found
along the way · How it was verified · Explain it in an interview · Try it yourself. Add a row to
`docs/build-log/README.md`.

Write for someone with a data-analysis background learning engineering: define terms on first use, use
plain language, and point to exact files.

## Conventions

- pnpm monorepo: apps in `apps/*`, shared code in `packages/*`, TypeScript, tests with Vitest.
- Never invent results, metrics or facts. If something wasn't checked, say so.
- Before pushing: `pnpm typecheck` and `pnpm test`. UI changes: also click through the flow in a browser.

## The dev team

Casebench 2 is built by a team of AI agents with the owner: `researcher`, `planner`, `engineer`,
`reviewer`, `tester`, `docs-writer` (`.claude/agents/`), run through `/rpi`
(`.claude/skills/rpi/SKILL.md`). The `cofounder` agent is the owner's strategic partner; `/talk <agent>`
opens a one-on-one chat with any team member. How the owner and team work together, including what the
owner delegated, is recorded in `.claude/team/decisions.md`.

Before asking the owner about past decisions, run `pnpm team:ask "…"` to search the team's notes. Read
your lessons in `.claude/team/lessons/` before you start. How it all works: `.claude/team/README.md`.
