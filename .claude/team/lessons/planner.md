# Planner lessons

- **Check the riskiest assumption first, cheaply.** "Can pytest run in Pyodide?" was a 20-minute check
  that decided the whole design of practice mode. (Practice mode, Oct 2026)
- **One section, then stop.** The owner: "include more if we are able to successfully do one section."
- **List what's NOT included** so the owner sees the trade-offs (e.g. "AI team comes in section 2",
  "server-side verification needs a sandbox, later").
- **Security changes the plan:** running user code on our server needs a real sandbox. Plan
  browser-side execution or a sandbox step explicitly; never "just run it on the server".
- **Plan only on what can actually run.** GitHub's scheduled jobs run only on the default branch, so a
  nightly job planned on a feature branch would never fire. (Librarian)
- **A test that proves "no invention" needs questions that should come back empty.** (Librarian)
- **Build owner decision points in after each risk check.** Evidence changed the label design twice
  (three labels → two → "nothing related" only on zero matches); each change went back to the owner.

### From the scikit-learn plan (Oct 11, Casebench 2)
- **Measure the first run and the re-runs separately.** In Node the first run took 10–11 s and re-runs
  1.8–4.3 s; quoting one number sets the wrong expectation.
- **Re-run a script rather than trusting its log.** `spike/rl.log` ended in an error from an older version
  of the script.
