# Tester lessons

- **Look at the screenshots.** A passing script once hid "1791530399.8 s" and an error box that said
  "check the error above" when it was below. (Practice mode)
- **Playwright strict mode:** scope selectors (e.g. `getByRole("dialog").getByRole("button", …)`), since the
  page and the dialog both have a "Create profile" button. Wait for the URL after a navigation click.
- **Don't `pkill -f` a pattern that also appears in your own command line.** It kills your shell. List the
  PIDs first.
- **`next build` overwrites the dev server's `.next`.** Restart the dev server after building.
- **Always try:** broken input (a syntax error), no profile, phone width (390 px), and check the database
  rows the feature writes.
- **Test labels with near-miss and short casual questions, not just full sentences and off-topic ones.**
  Near-misses got confident labels; one unfamiliar casual word hid a correct rank-1 result. (Librarian)
- **Mutation-test a safety net against the exact bug it was written for.** Re-adding the hide rule left
  the golden test green until casual questions were added. (Librarian)
- **Simulate a day of realistic notes before setting soft floors.** One plausible lesson bullet used up
  a whole 1-question margin. (Librarian)
- **Do repo-mutation checks in a tar copy of the working tree, never in place.** Restoring is then
  trivially exact. (Librarian)
- **Check excerpts against what matched, not only against the file.** Byte-correct excerpts showed a
  table's header instead of the matching row. (Librarian)
