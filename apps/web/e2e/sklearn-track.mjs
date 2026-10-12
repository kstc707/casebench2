// End-to-end check of the scikit-learn track in a real browser (section 1, step 10). Run by hand, not in
// CI: it needs Chromium and the 39 MB Pyodide download.
//
// It starts `next start` from apps/web (so run `pnpm --filter @casebench2/web pyodide` and
// `pnpm --filter @casebench2/web build` first), opens headless Chromium with a fresh profile, and:
//   1. opens the path (0 of 5 solved);
//   2. opens #33127, runs the issue's tests (they fail, showing the real assertion), breaks the syntax
//      (a plain "syntax error on line 192"), pastes the real fix and presses "Check my fix" (Solved);
//   3. goes back to the path (1 of 5 solved) and reloads (still solved);
//   4. does the same for #34815, so we don't trust a single success;
//   5. solves #33643, whose tests need the offline stand-in image (proves offlineData reaches the
//      browser's worker; without it 17 required tests would be skipped and it couldn't be solved);
//   6. runs code with an infinite loop: after the 60 s limit the run is stopped, Python restarts, and
//      the next run works;
//   7. checks that no page scrolls sideways at 390 px.
//
// Usage (from the repo root):
//   node apps/web/e2e/sklearn-track.mjs [--screenshots <dir>] [--skip-timeout]
// PLAYWRIGHT_MODULE can point at Playwright's index.mjs when `playwright` isn't installed for this repo
// (in the Casebench sandbox: /opt/node22/lib/node_modules/playwright/index.mjs).
// Exits 1 if any check fails.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = path.resolve(web, "../../content/scikit-learn");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const shots = path.resolve(arg("--screenshots") ?? path.join(os.tmpdir(), "sklearn-track-e2e"));
mkdirSync(shots, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const read = (slug, f) => readFileSync(path.join(content, slug, f), "utf8");
const taskJson = (slug) => JSON.parse(read(slug, "task.json"));
const aboutJson = (slug) => JSON.parse(read(slug, "about.json"));

let failures = 0;
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`.padStart(7);
function check(ok, what) {
  console.log(`[${secs()}] ${ok ? "PASS" : "FAIL"}: ${what}`);
  if (!ok) failures++;
}
const note = (what) => console.log(`[${secs()}]       ${what}`);

// --- start `next start` on a free port --------------------------------------------------------
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const server = spawn(path.join(web, "node_modules/.bin/next"), ["start", "-p", String(port)], { cwd: web, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const BASE = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  if (await fetch(BASE).then((r) => r.ok, () => false)) break;
  if (i > 60) throw new Error(`next start didn't come up:\n${serverLog}`);
  await new Promise((r) => setTimeout(r, 500));
}
note(`next start on ${BASE}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("browser console error:", m.text()));

const text = async (sel) => ((await page.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
const status = () => text('[data-testid="runner-status"]');
/** Waits until Python is ready (not loading, not running). */
async function waitReady(timeout = 180_000) {
  await page.waitForFunction(
    () => {
      const s = document.querySelector('[data-testid="runner-status"]')?.textContent ?? "";
      return s !== "" && !/Downloading|Starting|Running/.test(s);
    },
    null,
    { timeout }
  );
}
/** Replaces the student's file the way pasting would: select all, insert the text in one go. */
async function setCode(code) {
  await page.click(".ws-editor .cm-content");
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(code);
  await page.waitForTimeout(200);
}
/** Presses a run button and waits for the run to end; returns the announcement (aria-live) text. */
async function press(name, timeout) {
  await page.getByRole("button", { name }).click();
  await page.waitForFunction(() => /Running/.test(document.querySelector('[data-testid="runner-status"]')?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  await waitReady(timeout);
  await page.waitForTimeout(100);
  return text('[data-testid="announcement"]');
}
async function openTask(title) {
  await page.goto(`${BASE}/scikit-learn`);
  await page.getByRole("link", { name: title }).click();
  await page.waitForSelector('[data-testid="runner-status"]');
}
async function pathStatus(slug) {
  await page.goto(`${BASE}/scikit-learn`);
  await page.waitForSelector('[data-testid="solved-count"]');
  return [await text('[data-testid="solved-count"]'), await text(`[data-testid="status-${slug}"]`)];
}
/** Solves a task with its real fix and checks the path; returns nothing. */
async function solve(slug, n) {
  const t = taskJson(slug);
  await setCode(read(slug, `solution/${t.file}`));
  const said = await press("Check my fix");
  const required = t.failToPass.length + t.passToPass.length;
  check(said === `Solved. All ${required} required tests pass.`, `#${t.pr} real fix + "Check my fix": "${said}"`);
  check((await page.$('[data-testid="solved-banner"]')) !== null && (await text('[data-testid="fix-diff"]')).length > 0, `#${t.pr} shows "Solved", the real fix.diff and the PR link`);
  await page.screenshot({ path: path.join(shots, `${t.pr}-solved.png`), fullPage: true });
  const [count, st] = await pathStatus(slug);
  check(count === `${n} of 5 solved` && st === "Solved", `path after #${t.pr}: "${count}", #${t.pr} "${st}"`);
}

try {
  // 1. The path.
  await page.goto(`${BASE}/scikit-learn`);
  await page.waitForSelector('[data-testid="solved-count"]');
  check((await text('[data-testid="solved-count"]')) === "0 of 5 solved" && (await page.$$(".task-row")).length === 5, `path: "${await text('[data-testid="solved-count"]')}", 5 tasks`);

  // 2. #33127.
  const A = "weighted-percentile-zero-weight";
  const a = taskJson(A);
  const loadStart = Date.now();
  await openTask(aboutJson(A).title);
  note(`loading message: "${await status()}"`);
  await waitReady();
  note(`Python ready ${((Date.now() - loadStart) / 1000).toFixed(1)} s after opening the task (fresh browser profile, files from localhost)`);
  const quotes = await page.$$eval('[data-testid="quote-text"]', (ps) => ps.map((p) => p.textContent));
  check(JSON.stringify(quotes) === JSON.stringify(aboutJson(A).quotes.map((q) => q.text)), "quotes on the page are word for word the quotes in about.json (with <code> spans)");
  check((await page.$('[aria-label="Your code: sklearn/utils/stats.py"][contenteditable="true"]')) !== null, "the editor has an accessible name");
  let said = await press("Run the issue’s tests");
  const row = await text('[data-testid="test-row"]');
  check(said === "0 of 1 of the issue's tests pass." && row.includes("assert approx(2.0 ± 2.0e-06) == array(1.)"), `#33127 before: "${said}"; shows "${row.slice(0, 110)}…"`);
  await page.screenshot({ path: path.join(shots, "33127-issue-failed.png") });

  const before = read(A, `before/${a.file}`);
  await setCode(before.replace("if next_index >= max_idx:", "if next_index >= max_idx"));
  said = await press("Run the issue’s tests");
  check(said === "Your file has a syntax error on line 192: expected ':'", `syntax error: "${said}"`);
  check((await page.$$eval('[data-testid="test-row"]', (rs) => rs.map((r) => r.className))).every((c) => c.includes("not-run")), "no wall of \"missing\": test rows stay \"not run\"");
  await page.screenshot({ path: path.join(shots, "33127-syntax-error.png") });

  await solve(A, 1);
  await page.reload();
  await page.waitForSelector('[data-testid="solved-count"]');
  check((await text('[data-testid="solved-count"]')) === "1 of 5 solved", `after a reload: "${await text('[data-testid="solved-count"]')}"`);
  await page.screenshot({ path: path.join(shots, "path-1-solved.png") });

  // 4. #34815, a second task.
  const B = "fetch-file-plain-filename";
  await openTask(aboutJson(B).title);
  await waitReady();
  said = await press("Run the issue’s tests");
  check(said === `0 of ${taskJson(B).failToPass.length} of the issue's tests pass.`, `#34815 before: "${said}"`);
  await solve(B, 2);

  // 5. #33643: needs the offline stand-in image in the browser's worker.
  const C = "reconstruct-patches-full-size";
  await openTask(aboutJson(C).title);
  await waitReady();
  check((await text('[data-testid="offline-note"]')).startsWith("These tests use a stand-in image"), "#33643 shows the stand-in image note");
  said = await press("Run the issue’s tests");
  check(said === "0 of 4 of the issue's tests pass.", `#33643 before: "${said}"`);
  await solve(C, 3);

  // 6. An infinite loop: stopped after 60 s, Python restarts, the next run works.
  if (!process.argv.includes("--skip-timeout")) {
    await openTask(aboutJson(A).title);
    await waitReady();
    const fixed = read(A, `solution/${a.file}`);
    await setCode(fixed + "\nwhile True:\n    pass\n");
    const startLoop = Date.now();
    said = await press("Run the issue’s tests", 120_000);
    check(/took longer than 60 seconds and were stopped/.test(said), `infinite loop stopped, and Python ready again ${((Date.now() - startLoop) / 1000).toFixed(1)} s after pressing run: "${said}"`);
    await waitReady();
    await setCode(fixed);
    said = await press("Run the issue’s tests");
    check(said === "1 of 1 of the issue's tests pass.", `after the restart, the next run works: "${said}"`);
  } else note("skipped the infinite-loop check (--skip-timeout)");

  // 7. Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  const pages = ["/", "/scikit-learn", ...JSON.parse(readFileSync(path.join(content, "sources.json"), "utf8")).tasks.map((t) => `/scikit-learn/${t.slug}`)];
  for (const u of pages) {
    await page.goto(BASE + u);
    await page.waitForTimeout(1500);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw <= cw, `390 px ${u}: page width ${sw} (viewport ${cw})`);
  }
  await page.goto(`${BASE}/scikit-learn`);
  await page.screenshot({ path: path.join(shots, "path-390.png"), fullPage: true });
} catch (err) {
  failures++;
  console.log(`[${secs()}] FAIL: ${err instanceof Error ? err.message : err}`);
  await page.screenshot({ path: path.join(shots, "error.png") }).catch(() => {});
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
console.log(`\n${failures ? `${failures} check(s) FAILED` : "ALL CHECKS PASSED"} (screenshots in ${shots})`);
process.exit(failures ? 1 : 0);
