# Sources: scikit-learn #33362 (empty-pipeline-dir)

Everything quoted in `about.json` must appear word for word below. Fetched on 2026-10-11 from a git clone of https://github.com/scikit-learn/scikit-learn (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).

Made on 2026-10-11 by `python3 -I apps/web/scripts/make-sklearn-sources.py <scikit-learn clone> content/scikit-learn 2026-10-11` (clone at `102e5daf66759cf896beeee229d1bf7c80ab2ba4`).

## What could not be fetched

- The pull request page (https://github.com/scikit-learn/scikit-learn/pull/33362), its description, review comments and any linked issue: github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.
- An issue number: the commit message, the changelog entry and the test name none.

## The merge commit message

Commit `361a8e1cc81418f3f19014752da4817b94f72657` by Jérémie du Boisberranger, 2026-02-23. https://github.com/scikit-learn/scikit-learn/commit/361a8e1cc81418f3f19014752da4817b94f72657

```text
FIX make it possible to call `dir` on an empty pipeline (#33362)
```

## The changelog entry (`doc/whats_new/upcoming_changes/sklearn.pipeline/33362.fix.rst`)

https://github.com/scikit-learn/scikit-learn/blob/361a8e1cc81418f3f19014752da4817b94f72657/doc/whats_new/upcoming_changes/sklearn.pipeline/33362.fix.rst

```rst
- :class:`pipeline.Pipeline` now raises an `AttributeError` when accessing attributes
  that are not available on an empty pipeline. It's therefore possible to call `dir`
  on an empty pipeline.
  By :user:`Jérémie du Boisberranger <jeremiedbb>`.
```

## The test changes in the fix (`sklearn/tests/test_pipeline.py`)

https://github.com/scikit-learn/scikit-learn/commit/361a8e1cc81418f3f19014752da4817b94f72657

```diff
diff --git a/sklearn/tests/test_pipeline.py b/sklearn/tests/test_pipeline.py
index 4c0268fa8..c174af64a 100644
--- a/sklearn/tests/test_pipeline.py
+++ b/sklearn/tests/test_pipeline.py
@@ -324,6 +324,13 @@ def test_empty_pipeline():
         pipe.fit(X, y)
 
 
+def test_empty_pipeline_dir():
+    """Check that dir() works on an empty pipeline"""
+    pipe = Pipeline([])
+    attrs = dir(pipe)
+    assert "steps" in attrs
+
+
 def test_pipeline_init_tuple():
     # Pipeline accepts steps as tuple
     X = np.array([[1, 2]])
```

## Docstring of `Pipeline.classes_` in scikit-learn 1.8.0 (`sklearn/pipeline.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/pipeline.py

```text
The classes labels. Only exist if the last step is a classifier.
```

## Docstring of `Pipeline.n_features_in_` in scikit-learn 1.8.0 (`sklearn/pipeline.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/pipeline.py

```text
Number of features seen during first step `fit` method.
```

## Docstring of `Pipeline.feature_names_in_` in scikit-learn 1.8.0 (`sklearn/pipeline.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/pipeline.py

```text
Names of features seen during first step `fit` method.
```

## Checked by us (not upstream text; not quoted)

`dir(Pipeline([]))` in scikit-learn 1.8.0 (run in Pyodide 314.0.7 on 2026-10-11, last lines of the traceback):

```text
  File "/lib/python3.14/site-packages/sklearn/base.py", line 205, in __dir__
    return [attr for attr in super().__dir__() if hasattr(self, attr)]
                                                  ~~~~~~~^^^^^^^^^^^^
  File "/lib/python3.14/site-packages/sklearn/pipeline.py", line 388, in _final_estimator
    estimator = self.steps[-1][1]
                ~~~~~~~~~~^^^^
IndexError: list index out of range
```
