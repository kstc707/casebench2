# Docs writer lessons

- **Use the build-log sections `CLAUDE.md` requires.** Build log 14 (practice mode) used its own headings
  and should be brought in line.
- **Build-log numbers can collide across open PRs** (#7 and #8 both used 14). Check open PRs, not just
  the folder.
- **Quote numbers exactly from the reports** ("390 of 392", "39 of 62"); never round them into claims.
- **Include the dead ends.** "The first run said 19/62 and was wrong because…" is the best interview
  material.
- **Docs about the search tool become part of what it searches.** Naming a specific file twice in build
  log 15 pushed a ranking test's expected passage from rank 3 to 4. Describe examples generically, and re-run
  `npx vitest run packages/team-memory` after writing docs. (Librarian)
- **Measure the "before" baseline right before your change, in the same working tree.** Other uncommitted
  edits had already moved the numbers. (Librarian)
