# scikit-learn in a real browser: risk check (section 1, step 1)

**Result: passed.** Pyodide 314.0.7, scikit-learn 1.8.0, its tests and pytest 9.0.2 load in a module web
worker in headless Chromium, served from the self-hosted release files. For #33127 the "before" code
failed its test, the real fix passed, and the "before" code failed again, all in the same worker. The
issue's tests behave the same way for all 5 tasks, and the warm "Check my fix" for #33176 (226 required
tests) passes with the fix and fails only the 2 issue tests on "before".

Run on 2026-10-11 in this sandbox (4 CPUs), headless Chromium 141.0.7390.37 (Playwright 1.56.1).

## Measured numbers

Two full runs; both are shown so nobody trusts a single success.

| What | Run 1 | Run 2 |
|---|---|---|
| Download (bytes the server sent, uncompressed, 25 files) | 39.4 MB | 39.4 MB |
| First load, navigation to "sklearn and pytest imported" | 16.1 s | 16.9 s |
| · Pyodide core (`loadPyodide`) | 3.0 s | 3.1 s |
| · `loadPackage` scikit-learn, scikit-learn-tests, pytest | 5.3 s | 5.4 s |
| · first `import sklearn, numpy, scipy, pytest` | 7.7 s | 8.4 s |
| First test run (#33127 before, 1 test) | 5.7 s | 5.9 s |
| Re-runs of the issue's tests, all 5 tasks (range) | 2.5–4.9 s | 2.5–5.3 s |
| "Check my fix" #33176, 226 tests, real fix | 31.7 s | 30.2 s |
| "Check my fix" #33176, 226 tests, before | 31.8 s | 29.9 s |
| WASM heap (Pyodide linear memory) after boot / at end | 135.8 / 163.0 MB | 135.8 / 163.0 MB |
| Renderer process RSS at end (`ps`; page + worker) | 558.1 MB | 560.3 MB |

Largest downloads: scipy wheel 14.0 MB, `pyodide.asm.wasm` 9.6 MB, scikit-learn wheel 4.4 MB, numpy wheel
3.0 MB, `python_stdlib.zip` 2.5 MB, `scikit-learn-tests.zip` 1.4 MB. No 404s.

"Wall" times are measured in the page around `postMessage` → reply; "pytest" times are measured inside
Python. They agree within 0.1 s, so messaging costs nothing noticeable.

## Method

- **Files:** the Pyodide 314.0.7 release tarball from GitHub (SHA-256 `192b5864…aeb86645`, matching the
  plan), already extracted by the researcher. No jsDelivr, no PyPI.
- **Server:** `serve.mjs`, a local static server. `/pyodide/*` comes from the extracted release, the rest
  from this folder. It records the size of every file it sends; that list is the download size.
- **Page:** `index.html` starts one module worker (`new Worker(..., { type: "module" })`) and exposes
  `window.spike.call()`, which times each round trip.
- **Worker:** `worker.mjs` boots Pyodide, loads `scikit-learn`, `scikit-learn-tests` and `pytest`, then
  for each run: puts back any installed file an earlier run overwrote, writes the run's files over the
  installed scikit-learn files, deletes every `sklearn` / `sklearn.*` entry from `sys.modules`, and runs
  pytest on exactly the given test ids. No restarts between runs.
- **Tasks:** `prep.py` builds `spike-tasks.json` from the researcher's `tasks.json` (before/after files on
  top of 1.8.0) and `out_<pr>_{before,after}.json` (Node outcomes). Issue's tests = fail before, pass
  after. "Check my fix" ids = everything that passes after (failToPass + passToPass).
- **Driver:** `run.mjs` (Playwright) opens the page, boots, runs (b) and (c), checks each outcome and
  prints the numbers. Exit code 0 only if every check passes.

To reproduce (the inputs are in the session scratchpad, not in the repo):

```
python3 -I prep.py <scratchpad>/research/spike spike-tasks.json
node run.mjs <scratchpad>/research/pyo/pyodide
```

## Playwright output (run 1, unedited)

```
serving on http://127.0.0.1:8765
browser: 141.0.7390.37

(a) first load: 16.1 s from navigation (Pyodide core 3021 ms, packages 5322 ms, import 7672 ms)
    versions: {"python":"3.14.2","sklearn":"1.8.0","numpy":"2.4.6","scipy":"1.18.0","pytest":"9.0.2"}
    downloaded: 39.4 MB in 25 files (uncompressed, as served); 404s: none
        14.0 MB  /pyodide/scipy-1.18.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl
         9.6 MB  /pyodide/pyodide.asm.wasm
         4.4 MB  /pyodide/scikit_learn-1.8.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl
         3.0 MB  /pyodide/numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl
         2.5 MB  /pyodide/python_stdlib.zip
         1.4 MB  /pyodide/scikit-learn-tests.zip
  PASS: scikit-learn 1.8.0, its tests and pytest load in a module worker

(b) #33127 in one worker: before -> fix -> before (issue's tests)
33127 before (first run)           wall 5.7 s  (pytest 5.73 s)  {"failed":1}
                                    first failure: sklearn/utils/tests/test_stats.py::test_weighted_percentile_average_zero_weight_plateau: E       assert approx(2.0 ± 2.0e-06) == array(1.)
33127 real fix                     wall 4.7 s  (pytest 4.74 s)  {"passed":1}
33127 before again                 wall 4.7 s  (pytest 4.7 s)  {"failed":1}
                                    first failure: sklearn/utils/tests/test_stats.py::test_weighted_percentile_average_zero_weight_plateau: E       assert approx(2.0 ± 2.0e-06) == array(1.)
  PASS: before fails, fix passes, before fails again, same worker

(c) issue's tests for the other 4 tasks (same worker)
33643 before (4 tests)             wall 2.8 s  (pytest 2.79 s)  {"failed":4}
                                    first failure: sklearn/feature_extraction/tests/test_image.py::test_reconstruct_patches_edge_patch_size[image_size0-patch_size0]: E       AssertionError: 
33643 real fix                     wall 2.5 s  (pytest 2.5 s)  {"passed":4}
  PASS: 33643: fails before, passes with the fix
33176 before (2 tests)             wall 5.1 s  (pytest 5.09 s)  {"failed":2}
                                    first failure: sklearn/model_selection/tests/test_split.py::test_group_kfold[42-False-StratifiedGroupKFold]: E       Failed: DID NOT RAISE <class 'ValueError'>
33176 real fix                     wall 4.9 s  (pytest 4.92 s)  {"passed":2}
  PASS: 33176: fails before, passes with the fix
34815 before (10 tests)            wall 3.6 s  (pytest 3.55 s)  {"failed":10}
                                    first failure: sklearn/datasets/tests/test_base.py::test_fetch_file_rejects_path_as_local_filename[../]: E       Failed: DID NOT RAISE <class 'ValueError'>
34815 real fix                     wall 2.5 s  (pytest 2.52 s)  {"passed":10}
  PASS: 34815: fails before, passes with the fix
33362 before (1 tests)             wall 4.2 s  (pytest 4.17 s)  {"failed":1}
                                    first failure: sklearn/tests/test_pipeline.py::test_empty_pipeline_dir: E           IndexError: list index out of range
33362 real fix                     wall 4.1 s  (pytest 4.09 s)  {"passed":1}
  PASS: 33362: fails before, passes with the fix

(c) "Check my fix" for #33176 (226 required tests, warm worker)
33176 check, real fix              wall 31.7 s  (pytest 31.69 s)  {"passed":226}
  PASS: every required test passes with the fix
33176 check, before                wall 31.8 s  (pytest 31.84 s)  {"passed":224,"failed":2}
                                    first failure: sklearn/model_selection/tests/test_split.py::test_group_kfold[42-False-StratifiedGroupKFold]: E       Failed: DID NOT RAISE <class 'ValueError'>
  PASS: only the issue's tests fail on before

memory
    WASM heap (Pyodide linear memory): after boot 135.8 MB, at end 163.0 MB
    renderer processes RSS (ps): 558.1 MB

RESULT: ALL CHECKS PASSED
```

## Surprises

- **The first `import` is the slowest part of loading (7.7–8.4 s),** more than the download/unpack of
  packages (5.3 s). Because the spike imports scikit-learn during boot, the first test run is only
  5.7–5.9 s; Node's 10–11 s "first run" included that import.
- **Re-runs are a little slower than in Node:** 2.5–5.3 s here against 1.8–4.3 s in the planner's Node
  check. The plan's "about 2–4 s" should read "about 2–5 s".
- **"Check my fix" for #33176 takes about 30–32 s warm,** under the 39.6 s cold Node number and well
  inside the planned 120 s limit.
- **The first `E ` line is not always the useful one.** For #33643 it is just `E AssertionError:`; the
  real detail is on later lines. Step 4 should show all the `E ` lines (as Casebench 1 does), not the first.
- **My first attempt failed on a pytest detail, not the browser:** pluggy rejects a hook whose argument
  isn't named exactly `report`.

## Not verified

- **Download time over a real network.** Files came from localhost, so the 16 s is mostly CPU, not
  network. 39.4 MB is the uncompressed size; gzip/brotli savings weren't measured.
- **A second visit with the browser cache warm** (each run used a fresh browser profile).
- **JavaScript heap size** separately from the WASM heap. The RSS figure is the whole renderer process.
- **Other browsers** (Firefox, Safari) and slower machines or phones.
- **Timeouts and restarting Python** after a stuck run (step 4's job).
- **#33127's "Check my fix"** and the other tasks' full checks; only #33176's was run, as the plan asks.
