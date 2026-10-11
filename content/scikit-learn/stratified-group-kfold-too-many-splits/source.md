# Sources: scikit-learn #33176 (stratified-group-kfold-too-many-splits)

Everything quoted in `about.json` must appear word for word below. Fetched on 2026-10-11 from a git clone of https://github.com/scikit-learn/scikit-learn (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).

## What could not be fetched

- The pull request page (https://github.com/scikit-learn/scikit-learn/pull/33176), its description, review comments and any linked issue: github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.
- An issue number: the commit message, the changelog entry and the test name none.

## The merge commit message

Commit `237387b8e71e50d547d9130dd6a147bc83f37596` by Chani Fainendler, 2026-04-08. https://github.com/scikit-learn/scikit-learn/commit/237387b8e71e50d547d9130dd6a147bc83f37596

```text
FIX: StratifiedGroupKFold errors when n_splits > n_groups (#33176)

Co-authored-by: Jérémie du Boisberranger <jeremie@probabl.ai>
```

## The changelog entry (`doc/whats_new/upcoming_changes/sklearn.model_selection/33176.fix.rst`)

https://github.com/scikit-learn/scikit-learn/blob/237387b8e71e50d547d9130dd6a147bc83f37596/doc/whats_new/upcoming_changes/sklearn.model_selection/33176.fix.rst

```rst
- :class:`model_selection.StratifiedGroupKFold` now raises a `ValueError` when
  `n_splits` is greater than the number of unique groups, preventing degenerate folds.
  By :user:`Chani Fainendler <gitCHANI2005>`.
```

## The test changes in the fix (`sklearn/model_selection/tests/test_split.py`)

https://github.com/scikit-learn/scikit-learn/commit/237387b8e71e50d547d9130dd6a147bc83f37596

```diff
diff --git a/sklearn/model_selection/tests/test_split.py b/sklearn/model_selection/tests/test_split.py
index 43f6da90a..c75c15361 100644
--- a/sklearn/model_selection/tests/test_split.py
+++ b/sklearn/model_selection/tests/test_split.py
@@ -217,7 +217,7 @@ def test_2d_y():
         StratifiedKFold(),
         RepeatedKFold(),
         RepeatedStratifiedKFold(),
-        StratifiedGroupKFold(),
+        StratifiedGroupKFold(n_splits=3),
         ShuffleSplit(),
         StratifiedShuffleSplit(test_size=0.5),
         GroupShuffleSplit(),
@@ -1783,7 +1783,7 @@ def test_group_kfold(kfold, shuffle, global_random_seed):
     groups = np.array([1, 1, 1, 2, 2])
     X = y = np.ones(len(groups))
     with pytest.raises(ValueError, match="Cannot have number of splits.*greater"):
-        next(GroupKFold(n_splits=3).split(X, y, groups))
+        next(kfold(n_splits=3).split(X, y, groups))
 
 
 def test_time_series_cv():
```

## Docstring of `StratifiedGroupKFold` in scikit-learn 1.8.0 (`sklearn/model_selection/_split.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/model_selection/_split.py

```text
Class-wise stratified K-Fold iterator variant with non-overlapping groups.

This cross-validation object is a variation of :class:`StratifiedKFold` that
attempts to return stratified folds with non-overlapping groups. The folds are made
by preserving the percentage of samples for each class in `y` in a binary or
multiclass classification setting.

Each group will appear exactly once in the test set across all folds (the
number of distinct groups has to be at least equal to the number of folds).

The difference between :class:`GroupKFold`
and `StratifiedGroupKFold` is that
the former attempts to create balanced folds such that the number of
distinct groups is approximately the same in each fold, whereas
`StratifiedGroupKFold` attempts to create folds which preserve the
percentage of samples from each class as much as possible given the
constraint of non-overlapping groups between splits.

Read more in the :ref:`User Guide <stratified_group_k_fold>`.

For visualisation of cross-validation behaviour and
comparison between common scikit-learn split methods
refer to :ref:`sphx_glr_auto_examples_model_selection_plot_cv_indices.py`

.. note::

    Stratification on the class label solves an engineering problem rather
    than a statistical one. See :ref:`stratification` for more details.

Parameters
----------
n_splits : int, default=5
    Number of folds. Must be at least 2.

shuffle : bool, default=False
    Whether to shuffle each class's samples before splitting into batches.
    Note that the samples within each split will not be shuffled.
    This implementation can only shuffle groups that have approximately the
    same `y` class distribution, no global shuffle will be performed.

random_state : int or RandomState instance, default=None
    When `shuffle` is True, `random_state` affects the ordering of the
    indices, which controls the randomness of each fold for each class.
    Otherwise, leave `random_state` as `None`.
    Pass an int for reproducible output across multiple function calls.
    See :term:`Glossary <random_state>`.

Examples
--------
>>> import numpy as np
>>> from sklearn.model_selection import StratifiedGroupKFold
>>> X = np.ones((17, 2))
>>> y = np.array([0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
>>> groups = np.array([1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 5, 5, 6, 6, 7, 8, 8])
>>> sgkf = StratifiedGroupKFold(n_splits=3)
>>> sgkf.get_n_splits()
3
>>> print(sgkf)
StratifiedGroupKFold(n_splits=3, random_state=None, shuffle=False)
>>> for i, (train_index, test_index) in enumerate(sgkf.split(X, y, groups)):
...     print(f"Fold {i}:")
...     print(f"  Train: index={train_index}")
...     print(f"         group={groups[train_index]}")
...     print(f"  Test:  index={test_index}")
...     print(f"         group={groups[test_index]}")
Fold 0:
  Train: index=[ 0  1  2  3  7  8  9 10 11 15 16]
         group=[1 1 2 2 4 5 5 5 5 8 8]
  Test:  index=[ 4  5  6 12 13 14]
         group=[3 3 3 6 6 7]
Fold 1:
  Train: index=[ 4  5  6  7  8  9 10 11 12 13 14]
         group=[3 3 3 4 5 5 5 5 6 6 7]
  Test:  index=[ 0  1  2  3 15 16]
         group=[1 1 2 2 8 8]
Fold 2:
  Train: index=[ 0  1  2  3  4  5  6 12 13 14 15 16]
         group=[1 1 2 2 3 3 3 6 6 7 8 8]
  Test:  index=[ 7  8  9 10 11]
         group=[4 5 5 5 5]

Notes
-----
The implementation is designed to:

* Mimic the behavior of :class:`StratifiedKFold` as much as possible for trivial
  groups (e.g. when each group contains only one sample).
* Be invariant to class label: relabelling ``y = ["Happy", "Sad"]`` to
  ``y = [1, 0]`` should not change the indices generated.
* Stratify based on samples as much as possible while keeping
  non-overlapping groups constraint. That means that in some cases when
  there is a small number of groups containing a large number of samples
  the stratification will not be possible and the behavior will be close
  to :class:`GroupKFold`.

See also
--------
StratifiedKFold: Takes class information into account to build folds which
    retain class distributions (for binary or multiclass classification
    tasks).

GroupKFold: K-fold iterator variant with non-overlapping groups.
```

## Checked by us (not upstream text; not quoted)

`GroupKFold(n_splits=3)` with 2 groups in scikit-learn 1.8.0 (run in Pyodide 314.0.7 on 2026-10-11):

```text
ValueError('Cannot have number of splits n_splits=3 greater than the number of groups: 2.')
```
