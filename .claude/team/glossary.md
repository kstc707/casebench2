# Glossary

Terms the team uses, so agents and the owner mean the same thing.

| Term | Meaning |
|---|---|
| **Owner** | Sai, who decides what gets built and must be able to explain all of it |
| **Team lead** | The main Claude Code session; runs the `/rpi` workflow and calls the agents |
| **RPI** | Research → Plan → Implement. No code before the owner approves the plan |
| **Section** | One shippable slice of the product (e.g. "practice mode section 1"), one PR |
| **Plan step** | The smallest unit the engineer builds; small enough to review in one sitting |
| **Simulation / case study** | The original Casebench format: a fictional company, AI coworkers, a hidden truth |
| **Practice task** | A real bug fixed in an open-source project, turned into an exercise (`content/practice/`) |
| **Fail-to-pass tests** | Tests that fail before the fix and must pass after: they prove the fix |
| **Pass-to-pass tests** | Tests that pass before and must keep passing: "don't break anything" |
| **Tier 1 / Tier 2** | Practice on already-fixed issues / live contributions to real projects |
| **Run** | One attempt, stored as an append-only event log (`runs`, `run_events`) |
| **Truth model** | The hidden answer to a simulation; must never reach the browser |
| **Checked in browser** | The tests ran on the learner's machine, so the result isn't server-verified |
| **Load-bearing agent** | An agent the task can't be done without. The opposite of a gimmick |
| **Lesson** | A short, reusable thing an agent learned, kept in `lessons/` |
| **Retro** | The end-of-section step where lessons are recorded |
