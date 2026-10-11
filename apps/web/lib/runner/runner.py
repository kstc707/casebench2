"""
Runs scikit-learn's own tests inside Pyodide. Loaded by the browser's module worker
(scripts/runner-worker.mjs, served from public/pyodide/) and by the Node side (lib/runner/runner.ts),
so a task is always tested the same way.

_cb_run(files_json, ids_json):
  1. puts back every installed file an earlier run overwrote (so each run starts from scikit-learn 1.8.0);
  2. writes the given files (paths like "sklearn/utils/stats.py") over the installed scikit-learn files,
     keeping the originals;
  3. forgets every `sklearn` module already imported, so the edits take effect;
  4. runs pytest on exactly the given test ids (a whole test file's path reports every test in it);
  5. puts the originals back again.
It returns JSON:
  {"results": [{"id", "outcome": passed|failed|skipped|missing, "message"?}],
   "error": what stopped pytest from running the tests (e.g. a SyntaxError), else null,
   "durationMs": int}

Only the standard library is imported at the top, so the file-handling and message helpers can be
tested with any Python (lib/runner/runner.test.ts); pytest is imported when tests run.
"""
import contextlib, io, json, os, sys, sysconfig, time

# Never write .pyc files: Python checks a cached .pyc by the source's mtime (whole seconds) and size,
# so a same-size edit made within the same second could otherwise run the old code.
sys.dont_write_bytecode = True

_CB_PACKAGE = "sklearn"
_cb_site = sysconfig.get_paths()["purelib"]
_cb_originals = {}  # path -> the installed bytes (None if the file didn't exist), kept until restored
_cb_created_dirs = []  # folders a run created (outermost first), removed again on restore

# A failure message shows at most this much, so one huge diff can't flood the page.
_CB_MAX_MESSAGE_LINES = 60
_CB_MAX_MESSAGE_CHARS = 4000


def _cb_check_path(rel):
    """Only Python files inside the scikit-learn package may be written, by a plain relative path.
    A correctness guard (a task can't clobber pytest or the stdlib by mistake), not a security boundary:
    the student's own Python code can already read and write any file in the browser's Pyodide."""
    parts = rel.split("/")
    if (rel.startswith("/") or "\\" in rel or len(parts) < 2 or parts[0] != _CB_PACKAGE
            or not rel.endswith(".py") or any(p in ("", ".", "..") for p in parts)):
        raise ValueError(f"{rel!r} isn't a .py file inside {_CB_PACKAGE}/")


def _cb_restore(site=None):
    """Puts every overwritten file back as installed (and removes files and folders that weren't there)."""
    site = site or _cb_site
    for rel, data in list(_cb_originals.items()):
        full = os.path.join(site, rel)
        if data is None:
            if os.path.exists(full):
                os.remove(full)
        else:
            with open(full, "wb") as f:
                f.write(data)
        del _cb_originals[rel]
    for d in reversed(_cb_created_dirs):  # innermost first; leave a folder something else wrote into
        try:
            os.rmdir(d)
        except OSError:
            pass
    _cb_created_dirs.clear()


def _cb_make_dirs(d):
    """Like os.makedirs, remembering each folder it creates so restoring can remove it."""
    missing = []
    while not os.path.isdir(d):
        missing.append(d)
        d = os.path.dirname(d)
    for m in reversed(missing):
        os.mkdir(m)
        _cb_created_dirs.append(m)


def _cb_apply(files, site=None):
    """Writes files over the installed ones, remembering each original the first time it's overwritten."""
    site = site or _cb_site
    for rel in files:
        _cb_check_path(rel)
    for rel, text in files.items():
        full = os.path.join(site, rel)
        if rel not in _cb_originals:
            if os.path.exists(full):
                with open(full, "rb") as f:
                    _cb_originals[rel] = f.read()
            else:
                _cb_originals[rel] = None
        _cb_make_dirs(os.path.dirname(full))
        with open(full, "w", encoding="utf-8", newline="") as f:
            f.write(text)


def _cb_forget_modules():
    """Forgets every scikit-learn module (compiled parts included), so the next import reads the files again."""
    for name in list(sys.modules):
        if name == _CB_PACKAGE or name.startswith(_CB_PACKAGE + "."):
            del sys.modules[name]


def _cb_clip(lines):
    text = "\n".join(lines[:_CB_MAX_MESSAGE_LINES])
    if len(lines) > _CB_MAX_MESSAGE_LINES:
        text += f"\n… ({len(lines) - _CB_MAX_MESSAGE_LINES} more lines)"
    return text[:_CB_MAX_MESSAGE_CHARS]


def _cb_e_lines(lines):
    """pytest marks the error itself with "E " lines; returns all of them, without the marker."""
    marked = [l[1:] for l in lines if l.startswith("E ") or l == "E"]
    if not marked:
        return []
    indent = min((len(l) - len(l.lstrip()) for l in marked if l.strip()), default=0)
    return [l[indent:] for l in marked]


def _cb_failure_message(longrepr):
    """What to show for a failed test: all of pytest's "E " lines (the first is sometimes a bare
    "AssertionError:", with the detail on the next ones) and the file:line where it failed. Without
    "E " lines, the last lines of the report."""
    lines = (longrepr or "").strip("\n").splitlines()
    marked = _cb_e_lines(lines)
    if not marked:
        return _cb_clip(lines[-12:])
    where = next((l for l in reversed(lines) if l and not l.startswith("E ") and ".py:" in l), None)
    return _cb_clip(marked + ([where.strip()] if where else []))


def _cb_collection_error(output):
    """When pytest couldn't run the tests (e.g. a SyntaxError while importing the code): the real problem,
    not pytest's repeated "found no collectors" lines for each test id it couldn't find."""
    lines = [l for l in output.strip().splitlines() if "found no collectors" not in l]
    first = next((i for i, l in enumerate(lines) if "ERROR collecting" in l), max(0, len(lines) - 25))
    block = lines[first:first + 60]
    if not block:
        return "pytest couldn't run the tests and printed nothing."
    marked = _cb_e_lines(block)
    return _cb_clip([block[0].strip(" _"), *marked] if marked else block)


def _cb_expand_ids(ids, outcomes):
    """The ids to report: a test id ("file.py::test") as given; a whole test file ("file.py") as every
    test pytest ran from it, sorted (or the file itself as "missing" if none ran). The task builder runs
    whole files; the app runs exact ids."""
    out = []
    for i in ids:
        if "::" in i:
            out.append(i)
        else:
            found = sorted(n for n in outcomes if n.startswith(i + "::"))
            out.extend(found or [i])
    return out


def _cb_run(files_json, ids_json):
    import pytest

    files = json.loads(files_json)
    ids = json.loads(ids_json)
    start = time.time()
    outcomes = {}
    messages = {}

    class Collector:
        # pluggy checks hook arguments by name: this one must be called `report`.
        def pytest_runtest_logreport(self, report):
            if report.failed:
                outcomes[report.nodeid] = "failed"
                messages.setdefault(report.nodeid, _cb_failure_message(getattr(report, "longreprtext", "")))
            elif report.skipped and report.nodeid not in outcomes:
                outcomes[report.nodeid] = "skipped"
            elif report.when == "call" and report.passed and report.nodeid not in outcomes:
                outcomes[report.nodeid] = "passed"

    try:
        for rel in files:
            _cb_check_path(rel)
    except ValueError as e:
        return json.dumps({"results": [{"id": i, "outcome": "missing"} for i in ids], "error": str(e),
                           "durationMs": int((time.time() - start) * 1000)})

    out = io.StringIO()
    try:
        _cb_restore()
        _cb_apply(files)
        _cb_forget_modules()
        os.chdir(_cb_site)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = int(pytest.main(
                ["-q", "-p", "no:cacheprovider", "--color=no", "-o", "addopts=", "-W", "ignore", *ids],
                plugins=[Collector()],
            ))
    finally:
        _cb_restore()

    results = []
    for i in _cb_expand_ids(ids, outcomes):
        r = {"id": i, "outcome": outcomes.get(i, "missing")}
        if i in messages:
            r["message"] = messages[i]
        results.append(r)
    error = None
    if code in (2, 3, 4) or (ids and not outcomes):
        error = _cb_collection_error(out.getvalue())
    return json.dumps({"results": results, "error": error, "durationMs": int((time.time() - start) * 1000)})


def _cb_warm_up():
    """The first import of scikit-learn, scipy and pytest takes 7-8 s in a browser: done while loading,
    so the student's first click is fast. Returns the versions as JSON."""
    import numpy, scipy, sklearn, pytest
    return json.dumps({"python": sys.version.split()[0], "sklearn": sklearn.__version__,
                       "numpy": numpy.__version__, "scipy": scipy.__version__, "pytest": pytest.__version__})
