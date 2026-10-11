# Vision anchor: Casebench 2

> **DRAFT, written by the cofounder from the 2026-10-11 conversation, for Sai to edit.**
> Once Sai has rewritten it in his own words and removed this note, only Sai changes this file.
> Agents read it before every task.

## In one sentence

Casebench 2 teaches people who know some code but have never contributed how real open-source projects
work, and coaches them, using each project's own standards, from their first fork to their first merged
pull request.

## Who it's for

**The student is the main person we build for.** That means people like Sai: data analysts, data
scientists and students who can write Python but have never really "lived in GitHub" (forks, branches,
tests, reviews, pull requests). Sai is user number one: *if Sai can't go from zero to a merged pull request
with it, it isn't working.*

## What problem it solves

- **No path.** Tutorials teach Git once; good-first-issue lists drop you into a live project. Nothing walks
  you through the middle with context: *what am I learning, and why does this task matter?* (Version 1's
  weakness: real tasks, but "LeetCode with no context or path".)
- **Open source doesn't trust newcomers in the AI era.** Maintainers are flooded with low-quality
  AI-generated pull requests from people who can't explain their own changes. We don't fight AI use. **We
  teach students to use AI and still own their work.**

## How it works (first version of the idea)

1. **Learn how real projects work.** Forks, branches, tests, issues and how reviews sound, practised on a
   safe copy.
2. **Practise on real history.** Redo bugs and features that were already merged, then compare with the
   real fix *and the real review comments*. Every task says what it teaches, like a LeetCode topic.
3. **Contribute for real.** A live issue, with the AI coach checking the work against that project's
   rules and asking the student to explain the change before anything is submitted.

**The roles:**
- **The student** is the customer.
- **Maintainers** are partners, not customers. Their written standards ("what I look for in a pull
  request") are the curriculum. Solving AI slop is a *result* of well-prepared students.
- **The AI coach** must carry real weight: without it, there is no project-specific review practice and no
  "explain your change" check. (The data chief's test: delete the agent, and does the task still work? It
  must not.)

## Principles carried over from version 1

- Research → Plan → Implement. The owner approves plans before code and merges.
- Python first. Get one track fully working before adding more.
- Never invent results. Real tests, real history, real review comments.
- Keep it cheap to run, and built so more agents and tracks can be added.

## Open questions (not decided)

- Which track first: Python data libraries (docs, examples, notebooks, data fixes) or general Python?
- What does the student walk away with: a merged pull request, plus a record of how they got there that a
  recruiter can read?
- Can "explain your change" be checked reliably when AI can explain code too?
- Which 1–2 projects and maintainers will be our first partners?
