// End-to-end check of the coach ("Prepare your pull request") in a real browser (section 2, step 6).
// Run by hand, like e2e/sklearn-track.mjs. No real API call: every request to api.anthropic.com is
// answered by a Playwright route with a canned Messages API response (or a 401), and the script fails
// if the page contacts any other host.
//
// It starts `next start` from apps/web (build first), marks #33127 solved with the real fix as the
// draft (the solving itself is covered by sklearn-track.mjs), then goes through:
//   1. the automatic checks (all pass for the real fix; a leftover print() is caught);
//   2. the PR form and changelog fragment checks;
//   3. the three questions and the key-point self-check;
//   4. the AI review against the mocked API: request contents, the review shown with tokens and cost,
//      a thumbs-up, the coach log download, a rejected key (401), removing the saved key;
// and checks the page at 390 px.
//
// Usage (from the repo root): node apps/web/e2e/coach.mjs [--screenshots <dir>]
// PLAYWRIGHT_MODULE can point at Playwright's index.mjs (see sklearn-track.mjs).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = path.resolve(web, "../../content/scikit-learn");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const shots = path.resolve(arg("--screenshots") ?? path.join(os.tmpdir(), "coach-e2e"));
mkdirSync(shots, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const SLUG = "weighted-percentile-zero-weight";
const task = JSON.parse(readFileSync(path.join(content, SLUG, "task.json"), "utf8"));
const coach = JSON.parse(readFileSync(path.join(content, SLUG, "coach.json"), "utf8"));
const solution = readFileSync(path.join(content, SLUG, "solution", task.file), "utf8");

let failures = 0;
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`.padStart(7);
function check(ok, what) {
  console.log(`[${secs()}] ${ok ? "PASS" : "FAIL"}: ${what}`);
  if (!ok) failures++;
}

// --- the canned API answers ---------------------------------------------------------------------
const REVIEW = {
  verdict: "needs work",
  reasons: ["The explanation of why `>` is right misses what happens when next_index equals max_idx."],
  comments: [
    { severity: "suggestion", where: "answers", line: null, comment: "Say what value next_index has in the failing example.", rule: "R1" },
    { severity: "nit", where: "pr description", line: null, comment: "Use \"Fixes #<issue>\" so the issue closes on merge.", rule: "R42" },
  ],
  answers: coach.questions.map((q) => ({ questionId: q.id, covered: [q.points[0].id], missed: q.points.slice(1).map((p) => p.id), followUp: `Follow-up for ${q.id}?` })),
};
const apiMessage = {
  id: "msg_e2e",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(REVIEW) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 5000, output_tokens: 2000 },
};
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};

// --- start `next start` on a free port ----------------------------------------------------------
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const server = spawn(path.join(web, "node_modules/.bin/next"), ["start", "-p", String(port)], { cwd: web, stdio: ["ignore", "pipe", "pipe"], detached: true });
const BASE = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  if (await fetch(BASE).then((r) => r.ok, () => false)) break;
  if (i > 60) throw new Error("next start didn't come up");
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const hosts = new Set();
page.on("request", (r) => hosts.add(new URL(r.url()).host));
const apiCalls = [];
let apiMode = "ok";
const refusalMessage = { ...apiMessage, content: [{ type: "text", text: "" }], stop_reason: "refusal" };
await context.route("https://api.anthropic.com/**", async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  apiCalls.push({ url: req.url(), headers: req.headers(), body: JSON.parse(req.postData() ?? "{}") });
  if (apiMode === "refusal") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(refusalMessage) });
  if (apiMode === "401") {
    return route.fulfill({ status: 401, headers: CORS, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
  }
  return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(apiMessage) });
});

const text = async (sel) => ((await page.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
const tab = (name) => page.getByRole("tab", { name }).click();

try {
  // Solved #33127 with the real fix, as sklearn-track.mjs leaves it.
  await page.goto(`${BASE}/scikit-learn`);
  await page.evaluate(
    ([slug, code]) => {
      localStorage.setItem("casebench2.progress.v1", JSON.stringify({ version: 1, tasks: { [slug]: { status: "solved", solvedAt: "2026-10-12T00:00:00Z" } } }));
      localStorage.setItem(`casebench2.draft.v1.${slug}`, code);
    },
    [SLUG, solution]
  );
  await page.goto(`${BASE}/scikit-learn/${SLUG}`);
  await page.waitForSelector('[data-testid="coach"]');
  check(true, "the coach panel shows once the task is solved");

  // 1. Automatic checks.
  const ok = await page.$$eval(".check.ok", (els) => els.length);
  const bad = await page.$$eval(".check.bad", (els) => els.length);
  check(ok === 7 && bad === 0, `stage 1 with the real fix: ${ok} checks pass, ${bad} need work`);
  check((await text('[data-testid="check-scope-size"]')).includes("You didn't modify unrelated lines."), "each check cites scikit-learn's rule text");
  await page.screenshot({ path: path.join(shots, "coach-1-checks.png"), fullPage: true });
  await page.click(".ws-editor .cm-content");
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\nprint(\"debug\")\n");
  await page.waitForTimeout(200);
  check((await page.getAttribute('[data-testid="check-style-debug"]', "class")).includes("bad"), "a leftover print() added in the editor is caught");
  await page.click(".ws-editor .cm-content");
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(solution);
  await page.waitForTimeout(200);

  // 2. The PR and the changelog fragment.
  await tab("2. Write your PR");
  check((await text('[data-testid="fragment-path"]')) === `doc/whats_new/upcoming_changes/${coach.changelog.folder}/<PR number>.fix.rst`, `fragment path: ${await text('[data-testid="fragment-path"]')}`);
  const fill = (label, value) => page.getByLabel(label, { exact: true }).fill(value);
  await fill("Reference Issues/PRs", "Fixes #33126");
  await fill("What does this implement/fix? Explain your changes.", "With average=True, a zero-weight sample just before the end of the array changed the result, because the check used >= instead of >.");
  await fill("AI usage disclosure", "I didn't use AI tools for this change.");
  await fill("Fragment (reStructuredText)", "Fixed the weighted percentile.");
  const prOk = await page.$$eval('[data-testid^="check-pr-"]', (els) => els.every((e) => e.classList.contains("ok")));
  check(prOk, "the PR form checks pass once the sections are filled in");
  check((await page.getAttribute('[data-testid="check-fragment-user"]', "class")).includes("bad"), "a fragment without By :user:`…` is flagged");
  await fill("Fragment (reStructuredText)", "- Fixed ``_weighted_percentile`` with ``average=True`` so zero-weight samples\n  just before the end of the array are handled correctly.\n  By :user:`Student <student>`.");
  const fragOk = await page.$$eval('[data-testid^="check-fragment-"]', (els) => els.every((e) => e.classList.contains("ok")));
  check(fragOk, "a correct fragment passes every fragment check");
  await page.screenshot({ path: path.join(shots, "coach-2-pr.png"), fullPage: true });

  // 3. Explain.
  await tab("3. Explain");
  for (const q of coach.questions) {
    const box = page.locator(`[data-testid="question-${q.id}"]`);
    await box.locator("textarea").fill(`My answer about ${q.id}: the old check also fired when next_index equalled max_idx.`);
    await box.getByRole("button", { name: "Compare with the key points" }).click();
    await box.locator('input[type="checkbox"]').first().check();
  }
  const covered = await text(`[data-testid="question-${coach.questions[0].id}"] .points p`);
  check(covered === `1 of ${coach.questions[0].points.length} covered.`, `self-check: "${covered}"`);
  await page.screenshot({ path: path.join(shots, "coach-3-explain.png"), fullPage: true });

  // 4. AI review, against the mocked API.
  await tab("4. AI review");
  const note = await text('[data-testid="key-note"]');
  check(/localStorage/.test(note) && /only to api\.anthropic\.com/.test(note) && /spending limit/.test(note), "the page says where the key is kept, where it goes, and to use a spending limit");
  await page.getByLabel("Anthropic API key").fill("not-a-key");
  await page.getByRole("button", { name: "Review my pull request" }).click();
  check((await text('[data-testid="key-problem"]')).startsWith("That doesn't look like an Anthropic API key") && apiCalls.length === 0, "a malformed key is refused before anything is sent");
  await page.getByLabel("Anthropic API key").fill("sk-ant-e2e-test");
  check((await page.getAttribute("#" + (await page.getByLabel("Anthropic API key").getAttribute("id")).replace(/:/g, "\\:"), "autocomplete")) === "new-password", "the key field asks password managers not to fill it");
  check((await page.evaluate(() => localStorage.getItem("casebench2.anthropicKey.v1"))) === null, "typing a key doesn't save it");
  await page.getByRole("button", { name: "Save key in this browser" }).click();
  check((await page.evaluate(() => localStorage.getItem("casebench2.anthropicKey.v1"))) === "sk-ant-e2e-test", "the key is saved in localStorage when asked");
  await page.getByRole("button", { name: "Review my pull request" }).click();
  await page.waitForSelector('[data-testid="review-result"]', { timeout: 30_000 });
  const call = apiCalls[0];
  check(apiCalls.length === 1 && call.url.startsWith("https://api.anthropic.com/v1/messages"), `one request to ${call?.url}`);
  check(call.headers["x-api-key"] === "sk-ant-e2e-test" && (call.headers["anthropic-beta"] ?? "").includes("server-side-fallback-2026-07-01"), "it carries the key and the refusal-fallback beta");
  check(
    call.body.model === "claude-opus-5-5" && call.body.output_config?.effort === "medium" && call.body.output_config?.format?.type === "json_schema" && call.body.fallbacks === "default" && !("thinking" in call.body) && !("temperature" in call.body),
    "model, effort medium, JSON schema output, fallbacks, no thinking or temperature sent"
  );
  const sent = call.body.messages[0].content;
  check(sent.includes("+                if next_index > max_idx:") && sent.includes("Fixes #33126") && sent.includes("By :user:`Student <student>`") && /\[R1\] contributing\//.test(sent), "the request holds the diff, the PR text, the fragment and retrieved rule passages");
  check((await text('[data-testid="review-verdict"]')).startsWith("Needs work."), `verdict: "${await text('[data-testid="review-verdict"]')}"`);
  check((await page.$$('[data-testid="review-comment"]')).length === 2 && (await page.$$('[data-testid="answer-review"]')).length === 3, "2 comments and 3 answer reviews shown");
  check((await text('[data-testid="review-comment"]')).includes("Rule R1: contributing.rst"), "a comment shows the rule passage it cites");
  check(/^Cites a rule that wasn.t provided \(R42\)/.test(await text('[data-testid="invented-rule"]')), "a comment citing a rule that wasn't sent is marked");
  check((await text('[data-testid="review-violations"]')).includes("Comment 2 cites a rule that wasn't provided (R42)."), "the review's violations are listed");
  const usage = await text('[data-testid="review-usage"]');
  check(usage.startsWith("5,000 input + 2,000 output tokens · about $0.060 (estimate)"), `usage: "${usage}"`);
  await page.locator('[data-testid="review-comment"]').first().getByRole("button", { name: /Useful/ }).first().click();
  check((await page.locator('[data-testid="review-comment"]').first().getByRole("button", { name: "👍 Useful" }).getAttribute("aria-pressed")) === "true", "a thumbs-up is recorded");
  await page.screenshot({ path: path.join(shots, "coach-4-review.png"), fullPage: true });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download coach log (JSON)" }).click()]);
  const log = JSON.parse(readFileSync(await download.path(), "utf8"));
  check(
    log.format === "casebench2.coach-log.v1" && log.reviews.length === 1 && log.reviews[0].ratings["0"] === "up" && log.reviews[0].outcome.ok && log.reviews[0].outcome.usage.input_tokens === 5000 && log.reviews[0].request.model === "claude-opus-5-5",
    `coach log "${download.suggestedFilename()}": 1 review with inputs, outputs, tokens and the rating`
  );
  check(
    JSON.stringify(log.reviews[0].selfCheck) === JSON.stringify(Object.fromEntries(coach.questions.map((q) => [q.id, [q.points[0].id]]))) &&
      log.reviews[0].outcome.violations.some((v) => v.kind === "unknown-rule" && v.rule === "R42"),
    "the log keeps the student's own self-check and the review's violations next to the review"
  );
  check(!readFileSync(await download.path(), "utf8").includes("sk-ant-e2e-test"), "the coach log doesn't contain the key");

  apiMode = "refusal";
  await page.getByRole("button", { name: "Review my pull request" }).click();
  await page.waitForSelector('[data-testid="review-error"]', { timeout: 30_000 });
  const refusal = await text('[data-testid="review-error"]');
  check(refusal.startsWith("The model declined to review this request.") && refusal.includes("about $0.060 (estimate)"), `refusal, with its cost: "${refusal}"`);

  apiMode = "401";
  await page.getByRole("button", { name: "Review my pull request" }).click();
  await page.waitForSelector('[data-testid="review-error"]', { timeout: 30_000 });
  check((await text('[data-testid="review-error"]')).startsWith("This key was rejected."), `401: "${await text('[data-testid="review-error"]')}"`);
  await page.getByRole("button", { name: "Remove saved key" }).click();
  check((await page.evaluate(() => localStorage.getItem("casebench2.anthropicKey.v1"))) === null, "removing the key deletes it from localStorage");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector('[data-testid="coach"]');
  for (const name of ["1. Checks", "2. Write your PR", "3. Explain", "4. AI review"]) {
    await tab(name);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw <= cw, `390 px, stage "${name}": page width ${sw} (viewport ${cw})`);
  }
  await page.screenshot({ path: path.join(shots, "coach-390.png"), fullPage: true });
  const others = [...hosts].filter((h) => h !== `127.0.0.1:${port}` && h !== "api.anthropic.com");
  check(others.length === 0, `no other hosts contacted (${[...hosts].join(", ")})`);
} catch (err) {
  failures++;
  console.log(`[${secs()}] FAIL: ${err instanceof Error ? err.message : err}`);
  await page.screenshot({ path: path.join(shots, "coach-error.png") }).catch(() => {});
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
console.log(`\n${failures ? `${failures} check(s) FAILED` : "ALL CHECKS PASSED"} (screenshots in ${shots}; API calls: ${apiCalls.length}, all mocked)`);
process.exit(failures ? 1 : 0);
