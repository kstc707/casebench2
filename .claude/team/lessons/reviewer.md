# Reviewer lessons

- **Check that a failure can't look like a success.** A crashed test run was once counted as "no bug";
  a failed submission must never count as "solved" (`solvedBy` counts any evaluated run).
- **Check what's sent to the browser.** The simulation truth model and the real fix of a practice task
  must never be in client props or API responses.
- **Check that state transitions match the state machine** (`packages/domain/src/run.ts`), e.g. submitting
  a run that's still "started".
- **Duplicates in logs:** submit once recorded the final test run twice (browser + server). Ask "who
  writes this event?"
- **After a fix, re-run your earlier probes, not just the tests.** Tests stayed green while a fix pushed
  exact file-name matches from rank 2 to 4. (Librarian)
- **When a fix groups alternatives as "best of", check a weak one can't win alone** (a file extension, a
  folder name) and that two different ideas sharing a generic part aren't merged. (Librarian)
- **Check that query-side expansions can't stack over a threshold.** Adding a redundant synonym turned a
  weak result "strong" on a heading-only passage. (Librarian)
- **When a comment says "calibrated on" a dataset, check the dataset is in the repo.** (Librarian)
