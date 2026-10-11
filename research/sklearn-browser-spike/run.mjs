// Drives the spike in headless Chromium. usage: node run.mjs <pyodide dir>   (starts serve.mjs on :8765)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";
import { served } from "./serve.mjs";

const MB = (b) => (b / 1e6).toFixed(1) + " MB";
const show = (label, r) => console.log(`${label.padEnd(34)} wall ${(r.wallMs / 1000).toFixed(1)} s  (pytest ${r.pySecs} s)  ${JSON.stringify(r.counts)}` +
  (r.firstFailure ? `\n${" ".repeat(36)}first failure: ${r.firstFailure.slice(0, 160)}` : ""));
const allAre = (r, outcome, n) => r.counts[outcome] === n && Object.keys(r.counts).length === 1;
let ok = true;
const check = (cond, what) => { console.log(`  ${cond ? "PASS" : "FAIL"}: ${what}`); ok &&= cond; };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console error:", m.text()));
console.log("browser:", browser.version());

const t0 = Date.now();
await page.goto("http://127.0.0.1:8765/");
await page.waitForFunction(() => window.spike);
const boot = await page.evaluate(() => spike.call({ cmd: "boot" }));
const firstLoadMs = Date.now() - t0;
console.log(`\n(a) first load: ${(firstLoadMs / 1000).toFixed(1)} s from navigation (Pyodide core ${boot.coreMs} ms, packages ${boot.packagesMs} ms, import ${boot.importMs} ms)`);
console.log("    versions:", JSON.stringify(boot.versions));
const bootFiles = served.filter(([, n]) => n > 0);
const bootBytes = bootFiles.reduce((s, [, n]) => s + n, 0);
console.log(`    downloaded: ${MB(bootBytes)} in ${bootFiles.length} files (uncompressed, as served); 404s: ${served.filter(([, n]) => n < 0).map(([p]) => p).join(", ") || "none"}`);
for (const [p, n] of [...bootFiles].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${MB(n).padStart(9)}  ${p}`);
check(boot.versions.sklearn === "1.8.0", "scikit-learn 1.8.0, its tests and pytest load in a module worker");

await page.evaluate(() => (window.T = spike.tasks()));
const run = (pr, state, ids) => page.evaluate(([pr, state, ids]) => T.then((t) => spike.call({ cmd: "run", files: t[pr][state], ids: t[pr][ids] })), [pr, state, ids]);
const n = await page.evaluate(() => T.then((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [v.issueIds.length, v.checkIds.length]]))));

console.log("\n(b) #33127 in one worker: before -> fix -> before (issue's tests)");
const b1 = await run("33127", "before", "issueIds"); show("33127 before (first run)", b1);
const b2 = await run("33127", "after", "issueIds"); show("33127 real fix", b2);
const b3 = await run("33127", "before", "issueIds"); show("33127 before again", b3);
check(allAre(b1, "failed", n["33127"][0]) && allAre(b2, "passed", n["33127"][0]) && allAre(b3, "failed", n["33127"][0]),
  "before fails, fix passes, before fails again, same worker");

console.log("\n(c) issue's tests for the other 4 tasks (same worker)");
for (const pr of ["33643", "33176", "34815", "33362"]) {
  const r1 = await run(pr, "before", "issueIds"); show(`${pr} before (${n[pr][0]} tests)`, r1);
  const r2 = await run(pr, "after", "issueIds"); show(`${pr} real fix`, r2);
  check(allAre(r1, "failed", n[pr][0]) && allAre(r2, "passed", n[pr][0]), `${pr}: fails before, passes with the fix`);
}

console.log(`\n(c) "Check my fix" for #33176 (${n["33176"][1]} required tests, warm worker)`);
const c1 = await run("33176", "after", "checkIds"); show("33176 check, real fix", c1);
check(allAre(c1, "passed", n["33176"][1]), "every required test passes with the fix");
const c2 = await run("33176", "before", "checkIds"); show("33176 check, before", c2);
check(c2.counts.failed === n["33176"][0] && c2.counts.passed === n["33176"][1] - n["33176"][0], "only the issue's tests fail on before");

console.log("\nmemory");
console.log(`    WASM heap (Pyodide linear memory): after boot ${MB(boot.wasmHeapBytes)}, at end ${MB(c2.wasmHeapBytes)}`);
const rss = execSync("ps -eo rss,args").toString().split("\n").filter((l) => /--type=renderer/.test(l) && !/extension/.test(l))
  .map((l) => parseInt(l.trim()));
console.log(`    renderer processes RSS (ps): ${rss.map((k) => MB(k * 1024)).join(", ")}`);
await browser.close();
console.log(`\nRESULT: ${ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
process.exit(ok ? 0 : 1);
