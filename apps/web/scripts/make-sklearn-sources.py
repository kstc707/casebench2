"""Writes content/scikit-learn/<slug>/source.md from text actually fetched from a scikit-learn clone: each fix's
commit message, changelog entry, test changes and the 1.8.0 docstrings of where to look, plus what could not be fetched.
usage: python3 -I apps/web/scripts/make-sklearn-sources.py <sklearn clone> content/scikit-learn <fetched date>"""
import ast, json, os, subprocess, sys
repo, content, date = sys.argv[1:4]
REPO_URL = "https://github.com/scikit-learn/scikit-learn"
# slug -> (class or None, function) to show the docstring of, in the 1.8.0 file
LOOK = {
    "weighted-percentile-zero-weight": [(None, "_weighted_percentile")],
    "reconstruct-patches-full-size": [(None, "reconstruct_from_patches_2d")],
    "stratified-group-kfold-too-many-splits": [("StratifiedGroupKFold", None)],
    "fetch-file-plain-filename": [(None, "fetch_file")],
    "empty-pipeline-dir": [("Pipeline", "classes_"), ("Pipeline", "n_features_in_"), ("Pipeline", "feature_names_in_")],
}
# Our own checks (real output, run in Pyodide 314.0.7 with scikit-learn 1.8.0), kept apart from upstream text.
OUR_CHECKS = {
    "empty-pipeline-dir": ("`dir(Pipeline([]))` in scikit-learn 1.8.0 (run in Pyodide 314.0.7 on 2026-10-11, last lines of the traceback)",
        """  File "/lib/python3.14/site-packages/sklearn/base.py", line 205, in __dir__
    return [attr for attr in super().__dir__() if hasattr(self, attr)]
                                                  ~~~~~~~^^^^^^^^^^^^
  File "/lib/python3.14/site-packages/sklearn/pipeline.py", line 388, in _final_estimator
    estimator = self.steps[-1][1]
                ~~~~~~~~~~^^^^
IndexError: list index out of range"""),
    "stratified-group-kfold-too-many-splits": ("`GroupKFold(n_splits=3)` with 2 groups in scikit-learn 1.8.0 (run in Pyodide 314.0.7 on 2026-10-11)",
        "ValueError('Cannot have number of splits n_splits=3 greater than the number of groups: 2.')"),
}

def git(*a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True).stdout

def docstring(src, cls, fn):
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if cls and isinstance(node, ast.ClassDef) and node.name == cls:
            if fn is None:
                return ast.get_docstring(node)
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)) and sub.name == fn:
                    return ast.get_docstring(sub)
        if not cls and isinstance(node, ast.FunctionDef) and node.name == fn:
            return ast.get_docstring(node)
    raise SystemExit(f"no docstring for {cls}.{fn}")

def fence(text, lang="text"):
    return f"```{lang}\n{text.rstrip()}\n```\n"

sources = json.load(open(os.path.join(content, "sources.json")))
base = sources["base"]["commit"]
for t in sources["tasks"]:
    slug, pr, c = t["slug"], t["pr"], t["mergeCommit"]
    task = json.load(open(os.path.join(content, slug, "task.json")))
    msg = git("log", "-1", "--format=%B", c)
    author = git("log", "-1", "--format=%an, %ad", "--date=short", c).strip()
    frag = [f for f in git("show", "--name-only", "--format=", c).split() if f.startswith("doc/whats_new/")]
    test_diff = git("show", "--format=", c, "--", task["testFile"])
    before_src = git("show", f"{base}:{task['file']}")
    out = [f"# Sources: scikit-learn #{pr} ({slug})\n",
           f"Everything quoted in `about.json` must appear word for word below. Fetched on {date} from a git clone of "
           f"{REPO_URL} (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).\n",
           "## What could not be fetched\n",
           f"- The pull request page ({REPO_URL}/pull/{pr}), its description, review comments and any linked issue: "
           "github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.\n",
           ]
    refs = sorted({w.rstrip(".,)") for text in (msg, test_diff) for w in text.split() if "/issues/" in w})
    if refs:
        out.append(f"- The issue the fix's test names ({', '.join(refs)}): its page is blocked too. The commit message "
                   "and changelog entry name no issue.\n")
    else:
        out.append("- An issue number: the commit message, the changelog entry and the test name none.\n")
    out += ["\n## The merge commit message\n",
            f"Commit `{c}` by {author}. {REPO_URL}/commit/{c}\n\n", fence(msg)]
    for f in frag:
        out += [f"\n## The changelog entry (`{f}`)\n", f"{REPO_URL}/blob/{c}/{f}\n\n", fence(git("show", f"{c}:{f}"), "rst")]
    out += [f"\n## The test changes in the fix (`{task['testFile']}`)\n", f"{REPO_URL}/commit/{c}\n\n", fence(test_diff, "diff")]
    for cls, fn in LOOK[slug]:
        name = ".".join(x for x in (cls, fn) if x)
        out += [f"\n## Docstring of `{name}` in scikit-learn {sources['base']['tag']} (`{task['file']}`)\n",
                f"{REPO_URL}/blob/{sources['base']['tag']}/{task['file']}\n\n", fence(docstring(before_src, cls, fn))]
    if slug in OUR_CHECKS:
        what, text = OUR_CHECKS[slug]
        out += ["\n## Checked by us (not upstream text; not quoted)\n", f"{what}:\n\n", fence(text)]
    with open(os.path.join(content, slug, "source.md"), "w", newline="\n") as fh:
        text = "".join(out)
        lines, fenced = [], False
        for line in text.split("\n"):  # a blank line after every heading, outside code blocks
            if lines and not fenced and lines[-1].startswith("#") and line != "":
                lines.append("")
            if lines and not fenced and line.startswith("#") and lines[-1] != "":
                lines.append("")
            fenced ^= line.startswith("```")
            lines.append(line)
        fh.write("\n".join(lines))
    print(slug, "refs:", refs)
