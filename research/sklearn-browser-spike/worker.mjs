// Module worker: one long-lived Pyodide. In: {id, cmd:"boot"} | {id, cmd:"run", files, ids}. Out: {id, result} | {id, error}.
import { loadPyodide } from "/pyodide/pyodide.mjs";
let py;
const RUNNER = `
import contextlib, io, json, os, sys, sysconfig, time
import pytest
SITE = sysconfig.get_paths()["purelib"]
_originals = {}  # path -> installed text, kept so every run starts from the shipped files

def spike_run(files_json, ids_json):
    files, ids = json.loads(files_json), json.loads(ids_json)
    for p, text in _originals.items():          # put back what the last run overwrote
        open(os.path.join(SITE, p), "w").write(text)
    for p, text in files.items():
        full = os.path.join(SITE, p)
        if p not in _originals:
            _originals[p] = open(full).read() if os.path.exists(full) else ""
        open(full, "w").write(text)
    for m in list(sys.modules):                 # edits only take effect if sklearn is re-imported
        if m == "sklearn" or m.startswith("sklearn."):
            del sys.modules[m]
    os.chdir(SITE)
    oc, msg = {}, {}
    class C:
        def pytest_runtest_logreport(self, report):
            r = report
            if r.failed:
                oc[r.nodeid] = "failed"
                e = [l for l in (r.longreprtext or "").splitlines() if l.startswith("E ")]
                msg.setdefault(r.nodeid, e[0] if e else "")
            elif r.skipped and r.nodeid not in oc: oc[r.nodeid] = "skipped"
            elif r.when == "call" and r.passed: oc[r.nodeid] = "passed"
    t = time.time()
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        code = pytest.main(["-q", "-p", "no:cacheprovider", "--color=no", "-o", "addopts=", "-W", "ignore", *ids], plugins=[C()])
    counts = {}
    for i in ids:
        k = oc.get(i, "missing"); counts[k] = counts.get(k, 0) + 1
    first = next((f"{i}: {msg[i]}" for i in ids if i in msg), None)
    return json.dumps({"exit": int(code), "pySecs": round(time.time() - t, 2), "counts": counts, "firstFailure": first})
`;

async function boot() {
  const t0 = performance.now();
  py = await loadPyodide({ indexURL: new URL("/pyodide/", self.location.href).href, stdout: () => {}, stderr: () => {} });
  const tCore = performance.now();
  await py.loadPackage(["scikit-learn", "scikit-learn-tests", "pytest"], { messageCallback: () => {} });
  const tPkgs = performance.now();
  py.runPython(RUNNER);
  const versions = py.runPython(`import sklearn, numpy, scipy, sys; json.dumps({"python": sys.version.split()[0], "sklearn": sklearn.__version__, "numpy": numpy.__version__, "scipy": scipy.__version__, "pytest": pytest.__version__})`);
  const tImport = performance.now();
  return { coreMs: Math.round(tCore - t0), packagesMs: Math.round(tPkgs - tCore), importMs: Math.round(tImport - tPkgs),
    versions: JSON.parse(versions), wasmHeapBytes: py._module.HEAP8.length };
}

self.onmessage = async (e) => {
  const { id, cmd } = e.data;
  try {
    if (cmd === "boot") return self.postMessage({ id, result: await boot() });
    py.globals.set("_f", JSON.stringify(e.data.files));
    py.globals.set("_i", JSON.stringify(e.data.ids));
    const r = JSON.parse(py.runPython("spike_run(_f, _i)"));
    r.wasmHeapBytes = py._module.HEAP8.length;
    self.postMessage({ id, result: r });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
