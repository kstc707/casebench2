// The browser side of the test runner: a module web worker, so the page stays responsive while tests
// run. Not bundled by Next.js (its workers are classic scripts, and Pyodide needs a module worker):
// scripts/prepare-pyodide.mjs copies this file and lib/runner/runner.py to public/pyodide/, next to the
// versioned Pyodide folder. lib/runner/useTestRunner.ts starts it.
//
// Out: { type: "progress", stage: "python" | "packages" | "importing" } while loading,
//      { type: "ready", versions } or { type: "boot-error", error } once,
//      then { id, result } or { id, error } per run.
// In:  { id, files, testIds, options? }   (options: { offlineData?: ["raccoon_face"] })
import { loadPyodide } from "./314.0.7/pyodide.mjs"; // keep in step with PYODIDE_VERSION (lib/runner/types.ts)

const PACKAGES = ["scikit-learn", "scikit-learn-tests", "pytest"]; // RUNNER_PACKAGES in lib/runner/types.ts
const here = new URL("./", import.meta.url);

async function boot() {
  self.postMessage({ type: "progress", stage: "python" });
  const py = await loadPyodide({ indexURL: new URL("314.0.7/", here).href, stdout: () => {}, stderr: () => {} });
  self.postMessage({ type: "progress", stage: "packages" });
  await py.loadPackage(PACKAGES, { messageCallback: () => {} });
  py.runPython(await (await fetch(new URL("runner.py", here))).text());
  // The first import of scikit-learn, scipy and pytest is the slowest part of loading (7-8 s): do it
  // now, so the student's first click is fast.
  self.postMessage({ type: "progress", stage: "importing" });
  const versions = JSON.parse(py.runPython("_cb_warm_up()"));
  return { py, versions };
}

const ready = boot();
ready.then(
  ({ versions }) => self.postMessage({ type: "ready", versions }),
  (err) => self.postMessage({ type: "boot-error", error: String(err) })
);

self.onmessage = async (e) => {
  const { id, files, testIds, options = {} } = e.data;
  try {
    const { py } = await ready;
    py.globals.set("_cb_files", JSON.stringify(files));
    py.globals.set("_cb_ids", JSON.stringify(testIds));
    py.globals.set("_cb_options", JSON.stringify(options));
    const json = await py.runPythonAsync("_cb_run(_cb_files, _cb_ids, _cb_options)");
    self.postMessage({ id, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
