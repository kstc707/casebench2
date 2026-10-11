# Researcher lessons

- **Competitors already doing "AI coworkers in a job simulation":** SIMU (AI teammates; data analyst, SWE,
  SQL, SOC roles), Anthropos (AI actors; sells to companies), Forage (200+ employer simulations),
  CodeSignal (agentic assessments of AI-assisted work), Vervoe, HireVue. Any plan must say how it differs.
  (Research, Oct 2026)
- **Open-source onboarding tools found:** First Contributions (sandbox), OpenStart (AI explains repos),
  OS-Mentors (human mentors), Outreachy (paid internships incl. UX/docs/data). None pairs an AI team with
  real graded outcomes, as of Oct 2026.
- **Maintainers are wary of AI-generated PRs:** GitHub added PR-limiting controls on 2026-08-27; tldraw
  auto-closes external PRs. Anything that sends work upstream needs a quality gate.
- **Some sites are blocked from this sandbox** (simuai.io, anthropos.work, infoworld.com). Say so and use
  search summaries or other sources, labelled as such.
- **When docs.github.com or paper sites are blocked here, use raw.githubusercontent.com** (the `github/docs`
  repo is the source of GitHub's docs) and the paper's own repo BibTeX. Say which you used. (Librarian)
- **Workspace packages aren't importable from root `scripts/`;** a CLI needing `@casebench/*` belongs in a
  package. (Librarian)
