# Build journal

One file per day (`YYYY-MM-DD.md`): **how** Casebench is being built, not just what. The team lead adds a
line at every stage of an `/rpi` cycle, and after one-on-one chats that led somewhere. Git history and
build logs record *what* changed; this records the process: who did what, what was found, what was
decided, and what went wrong.

Format:

```
# 2026-10-11

## <cycle or topic>
- HH:MM UTC · <who> · <what happened> (links: commit, PR, file)
```

Rules: facts only (real times, real results, real links); short lines; never edit past entries. Add a
correction as a new line instead. The librarian (once built) searches these files, and the cofounder
reads the latest ones to know what the team actually did.
