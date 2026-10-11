import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startRunner, type Runner } from "./runner";
import { PYODIDE_VERSION, RUNNER_PACKAGES } from "./types";

const runnerPy = path.join(__dirname, "runner.py");

/**
 * Runs a snippet against runner.py's helpers with the system Python (no Pyodide or pytest needed:
 * runner.py imports pytest only when tests run). `r` is the loaded module; the snippet prints JSON.
 */
function py(snippet: string): unknown {
  const script = `
import importlib.util, json, os, sys, tempfile
spec = importlib.util.spec_from_file_location("runner", sys.argv[1])
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
${snippet}`;
  return JSON.parse(execFileSync("python3", ["-I", "-B", "-c", script, runnerPy], { encoding: "utf8" }));
}

describe("runner.py: writing over the installed files and putting them back", () => {
  it("restores the installed file, and removes a file and folders that weren't installed", () => {
    const out = py(`
site = tempfile.mkdtemp()
os.makedirs(os.path.join(site, "sklearn/utils"))
stats = os.path.join(site, "sklearn/utils/stats.py")
open(stats, "w").write("shipped\\n")
r._cb_apply({"sklearn/utils/stats.py": "first edit\\n", "sklearn/new/deeper/new.py": "x = 1\\n"}, site)
created = os.path.isfile(os.path.join(site, "sklearn/new/deeper/new.py"))
during = open(stats).read()
r._cb_apply({"sklearn/utils/stats.py": "second edit\\n"}, site)  # the original is kept from the first write
r._cb_restore(site)
print(json.dumps({"during": during, "after": open(stats).read(),
                  "created": created, "newFolderExists": os.path.exists(os.path.join(site, "sklearn/new")),
                  "sklearnExists": os.path.isdir(os.path.join(site, "sklearn")),
                  "remembered": len(r._cb_originals), "folders": len(r._cb_created_dirs)}))
`);
    expect(out).toEqual({ during: "first edit\n", after: "shipped\n", created: true, newFolderExists: false, sklearnExists: true, remembered: 0, folders: 0 });
  });

  it("keeps the student's bytes exactly (no newline translation)", () => {
    const out = py(`
site = tempfile.mkdtemp()
os.makedirs(os.path.join(site, "sklearn"))
r._cb_apply({"sklearn/a.py": "x = 1\\r\\ny = 2\\n"}, site)
print(json.dumps(open(os.path.join(site, "sklearn/a.py"), "rb").read().decode()))
`);
    expect(out).toBe("x = 1\r\ny = 2\n");
  });

  it("only writes inside sklearn/, by a plain relative path, and writes nothing if any path is refused", () => {
    const out = py(`
site = tempfile.mkdtemp()
os.makedirs(os.path.join(site, "sklearn"))
bad = ["/etc/passwd", "../x.py", "sklearn/../pytest.py", "pytest/__init__.py", "sklearn//a.py", "sklearn\\\\a.py", "sklearn/./a.py",
       "sklearn", "sklearn.py", "sklearn/data.csv", "sklearn/utils"]
refused = []
for p in bad:
    try:
        r._cb_apply({"sklearn/ok.py": "x", p: "x"}, site)
    except ValueError:
        refused.append(p)
print(json.dumps({"refused": refused, "okWritten": os.path.exists(os.path.join(site, "sklearn/ok.py"))}))
`) as { refused: string[]; okWritten: boolean };
    expect(out.refused).toHaveLength(11);
    expect(out.okWritten).toBe(false);
  });

  it("puts the files back even when pytest itself fails mid-run", () => {
    const out = py(`
import types
site = tempfile.mkdtemp()
os.makedirs(os.path.join(site, "sklearn/utils"))
stats = os.path.join(site, "sklearn/utils/stats.py")
open(stats, "w").write("shipped\\n")
r._cb_site = site
seen = {}
def main(args, plugins):
    seen["during"] = open(stats).read()
    raise RuntimeError("pytest blew up")
sys.modules["pytest"] = types.SimpleNamespace(main=main)
try:
    r._cb_run(json.dumps({"sklearn/utils/stats.py": "edit\\n", "sklearn/extra/x.py": ""}), json.dumps(["sklearn/utils/tests/test_stats.py::t"]))
    raised = None
except RuntimeError as e:
    raised = str(e)
print(json.dumps({"raised": raised, "during": seen.get("during"), "after": open(stats).read(),
                  "extra": os.path.exists(os.path.join(site, "sklearn/extra")), "remembered": len(r._cb_originals)}))
`);
    expect(out).toEqual({ raised: "pytest blew up", during: "edit\n", after: "shipped\n", extra: false, remembered: 0 });
  });

  it("reports exact ids as given, and a whole test file as every test it ran, sorted", () => {
    const out = py(`
outcomes = {"a.py::t2": "passed", "a.py::t1": "failed", "ab.py::t": "passed", "b.py::x": "passed"}
print(json.dumps(r._cb_expand_ids(["b.py::x", "a.py", "c.py", "c.py::gone"], outcomes)))
`);
    expect(out).toEqual(["b.py::x", "a.py::t1", "a.py::t2", "c.py", "c.py::gone"]);
  });

  it("_cb_offline_data puts back face, pooch and SKLEARN_SKIP_NETWORK_TESTS, also when the body raises", () => {
    const out = py(`
import types
scipy = types.ModuleType("scipy"); datasets = types.ModuleType("scipy.datasets")
def real_face(gray=False): return "real"
datasets.face = real_face; scipy.datasets = datasets
sys.modules["scipy"] = scipy; sys.modules["scipy.datasets"] = datasets

def state():
    return {"env": os.environ.get("SKLEARN_SKIP_NETWORK_TESTS"), "pooch": "pooch" in sys.modules,
            "face": "real" if datasets.face is real_face else ("synthetic" if datasets.face is r._cb_synthetic_face else "other")}

report = {"start": state()}
with r._cb_offline_data(["raccoon_face"]):
    report["inside"] = state()
report["after"] = state()
try:
    with r._cb_offline_data(["raccoon_face"]):
        raise RuntimeError("test blew up")
except RuntimeError:
    pass
report["afterRaise"] = state()

# Values that were already there are kept, not removed.
os.environ["SKLEARN_SKIP_NETWORK_TESTS"] = "1"
real_pooch = types.ModuleType("pooch"); sys.modules["pooch"] = real_pooch
with r._cb_offline_data(["raccoon_face"]):
    report["insideWithExisting"] = state()
report["afterExisting"] = {**state(), "samePooch": sys.modules.get("pooch") is real_pooch}
with r._cb_offline_data([]):
    report["noneRequested"] = state()
print(json.dumps(report))
`);
    expect(out).toEqual({
      start: { env: null, pooch: false, face: "real" },
      inside: { env: "0", pooch: true, face: "synthetic" },
      after: { env: null, pooch: false, face: "real" },
      afterRaise: { env: null, pooch: false, face: "real" },
      insideWithExisting: { env: "0", pooch: true, face: "synthetic" },
      afterExisting: { env: "1", pooch: true, face: "real", samePooch: true },
      noneRequested: { env: "1", pooch: true, face: "real" },
    });
  });

  it("refuses offline data it doesn't know, without running anything", () => {
    const out = py(`
import types
sys.modules["pytest"] = types.SimpleNamespace(main=lambda *a, **k: (_ for _ in ()).throw(AssertionError("ran")))
print(r._cb_run(json.dumps({}), json.dumps(["sklearn/tests/test_x.py::t"]), json.dumps({"offlineData": ["raccoon_face", "mnist"]})))
`) as { error: string; results: { outcome: string }[] };
    expect(out.error).toBe("unknown offline data: mnist");
    expect(out.results.map((r) => r.outcome)).toEqual(["missing"]);
  });

  it("forgets every sklearn module, and only those", () => {
    const out = py(`
import types
for n in ["sklearn", "sklearn.utils", "sklearn.utils._cython_blas", "sklearnish", "scipy_fake"]:
    sys.modules[n] = types.ModuleType(n)
r._cb_forget_modules()
print(json.dumps(sorted(n for n in ["sklearn", "sklearn.utils", "sklearn.utils._cython_blas", "sklearnish", "scipy_fake"] if n in sys.modules)))
`);
    expect(out).toEqual(["scipy_fake", "sklearnish"]);
  });
});

describe("runner.py: what a failure shows", () => {
  it("shows all the E lines, not just the first, and where it failed", () => {
    // Shaped like pytest's report for scikit-learn #33643, whose first E line is a bare "AssertionError:".
    const longrepr = [
      "    def test_reconstruct_patches_edge_patch_size(image_size, patch_size):",
      ">       assert_array_equal(image, reconstructed)",
      "E       AssertionError: ",
      "E       Arrays are not equal",
      "E       ",
      "E       Mismatched elements: 3 / 16 (18.8%)",
      "",
      "sklearn/feature_extraction/tests/test_image.py:412: AssertionError",
    ].join("\n");
    const msg = py(`print(json.dumps(r._cb_failure_message(${JSON.stringify(longrepr)})))`);
    expect(msg).toBe(
      [
        "AssertionError: ",
        "Arrays are not equal",
        "",
        "Mismatched elements: 3 / 16 (18.8%)",
        "sklearn/feature_extraction/tests/test_image.py:412: AssertionError",
      ].join("\n")
    );
  });

  it("falls back to the last lines when there are no E lines, and caps long messages", () => {
    const plain = py(`print(json.dumps(r._cb_failure_message("one\\ntwo\\nthree")))`);
    expect(plain).toBe("one\ntwo\nthree");
    const long = py(`print(json.dumps(r._cb_failure_message("\\n".join("E   line %d" % i for i in range(200)))))`) as string;
    expect(long.split("\n")).toHaveLength(61);
    expect(long).toContain("… (140 more lines)");
  });

  it("shows a SyntaxError, not pytest's repeated 'found no collectors'", () => {
    const output = [
      "==================================== ERRORS ====================================",
      "______________ ERROR collecting sklearn/utils/tests/test_stats.py ______________",
      "/lib/python3.14/site-packages/_pytest/python.py:507: in importtestmodule",
      "    mod = import_path(",
      "E     File \"/lib/python3.14/site-packages/sklearn/utils/stats.py\", line 192",
      "E       if next_index >= max_idx",
      "E                                ^",
      "E   SyntaxError: expected ':'",
      "=========================== short test summary info ============================",
      "ERROR sklearn/utils/tests/test_stats.py",
      "ERROR: found no collectors for /lib/python3.14/site-packages/sklearn/utils/tests/test_stats.py::test_a",
      "ERROR: found no collectors for /lib/python3.14/site-packages/sklearn/utils/tests/test_stats.py::test_b",
    ].join("\n");
    const err = py(`print(json.dumps(r._cb_collection_error(${JSON.stringify(output)})))`) as string;
    expect(err.split("\n")[0]).toBe("ERROR collecting sklearn/utils/tests/test_stats.py");
    expect(err).toContain("SyntaxError: expected ':'");
    expect(err).toContain('stats.py", line 192');
    expect(err).not.toContain("found no collectors");
    expect(err).not.toContain("import_path");
  });
});

describe("the browser worker", () => {
  it("loads the same Pyodide version and packages as the Node side", () => {
    const worker = readFileSync(path.join(__dirname, "../../scripts/runner-worker.mjs"), "utf8");
    expect(worker).toContain(`from "./${PYODIDE_VERSION}/pyodide.mjs"`);
    expect(worker).toContain(`new URL("${PYODIDE_VERSION}/", here)`);
    expect(worker).toContain(`const PACKAGES = ${JSON.stringify(RUNNER_PACKAGES).replace(/,/g, ", ")};`);
    // pluggy rejects the hook unless its argument is named exactly "report".
    expect(readFileSync(runnerPy, "utf8")).toContain("def pytest_runtest_logreport(self, report):");
  });
});

// The real thing: Pyodide 314.0.7 with scikit-learn 1.8.0, from public/pyodide (run `pnpm pyodide` first).
// It takes about a minute, so it runs only when asked: `pnpm test:pyodide` (the slower "tasks" CI job).
// #33127 as built by scripts/build-sklearn-tasks.ts (content/scikit-learn/weighted-percentile-zero-weight).
const STATS = "sklearn/utils/stats.py";
const TESTS = "sklearn/utils/tests/test_stats.py";
const taskDir = path.resolve(__dirname, "../../../../content/scikit-learn/weighted-percentile-zero-weight");
const task = JSON.parse(readFileSync(path.join(taskDir, "task.json"), "utf8")) as { failToPass: string[] };
const fixture = {
  issueIds: task.failToPass,
  before: { [STATS]: readFileSync(path.join(taskDir, "before", STATS), "utf8"), [TESTS]: readFileSync(path.join(taskDir, "tests", TESTS), "utf8") },
  fix: { [STATS]: readFileSync(path.join(taskDir, "solution", STATS), "utf8") },
};

describe.skipIf(!process.env.RUN_PYODIDE_TESTS)("the Node runner on scikit-learn #33127 (one Python)", () => {
  let runner: Runner;
  const outcomes = (r: Awaited<ReturnType<Runner["run"]>>) => r.results.map((t) => t.outcome);

  it("starts Pyodide with scikit-learn 1.8.0 and pytest 9.0.2", { timeout: 180_000 }, async () => {
    runner = await startRunner();
    expect(runner.versions).toMatchObject({ sklearn: "1.8.0", pytest: "9.0.2" });
  });

  it("before: 1 failed, showing the real assertion", { timeout: 120_000 }, async () => {
    const r = await runner.run(fixture.before, fixture.issueIds);
    expect(r.error).toBeNull();
    expect(outcomes(r)).toEqual(["failed"]);
    expect(r.results[0].message).toContain("assert approx(2.0 ± 2.0e-06) == array(1.)");
  });

  it("with the real fix: 1 passed", { timeout: 120_000 }, async () => {
    const r = await runner.run({ ...fixture.before, ...fixture.fix }, fixture.issueIds);
    expect(r.error).toBeNull();
    expect(outcomes(r)).toEqual(["passed"]);
  });

  it("afterwards the installed file is the shipped one again (only the test file sent: fails)", { timeout: 120_000 }, async () => {
    const r = await runner.run({ [TESTS]: fixture.before[TESTS] }, fixture.issueIds);
    expect(outcomes(r)).toEqual(["failed"]);
  });

  it("a syntax error shows the SyntaxError and its line, then the next run works", { timeout: 120_000 }, async () => {
    const broken = fixture.before[STATS].replace("if next_index >= max_idx:", "if next_index >= max_idx");
    expect(broken).not.toBe(fixture.before[STATS]);
    const r = await runner.run({ ...fixture.before, [STATS]: broken }, fixture.issueIds);
    expect(outcomes(r)).toEqual(["missing"]);
    expect(r.error).toContain("SyntaxError");
    expect(r.error).toMatch(/stats\.py", line \d+/);
    expect(r.error).not.toContain("found no collectors");

    const again = await runner.run({ ...fixture.before, ...fixture.fix }, fixture.issueIds);
    expect(outcomes(again)).toEqual(["passed"]);
  });

  it("installedFile gives the shipped 1.8.0 file, even right after a run that overwrote it", { timeout: 120_000 }, async () => {
    await runner.run({ ...fixture.before, ...fixture.fix }, fixture.issueIds);
    expect(runner.installedFile(STATS)).toBe(fixture.before[STATS]);
    expect(() => runner.installedFile("pytest.py")).toThrow(/isn't a \.py file inside sklearn\//);
  });

  it("with offlineData raccoon_face, the face tests really run; without it they are skipped again", { timeout: 120_000 }, async () => {
    const dir = path.resolve(__dirname, "../../../../content/scikit-learn/reconstruct-patches-full-size");
    const t = JSON.parse(readFileSync(path.join(dir, "task.json"), "utf8")) as { file: string; testFile: string };
    const files = {
      [t.file]: readFileSync(path.join(dir, "solution", t.file), "utf8"),
      [t.testFile]: readFileSync(path.join(dir, "tests", t.testFile), "utf8"),
    };
    const perfect = `${t.testFile}::test_reconstruct_patches_perfect`;
    const withFace = await runner.run(files, [perfect, `${t.testFile}::test_connect_regions`], { offlineData: ["raccoon_face"] });
    expect(outcomes(withFace)).toEqual(["passed", "passed"]);
    const without = await runner.run(files, [perfect]);
    expect(outcomes(without)).toEqual(["skipped"]);
  });

  it("refuses a file outside sklearn/", { timeout: 60_000 }, async () => {
    const r = await runner.run({ "pytest.py": "" }, fixture.issueIds);
    expect(r.error).toMatch(/isn't a \.py file inside sklearn\//);
    expect(outcomes(r)).toEqual(["missing"]);
  });
});
