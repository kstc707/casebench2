# Sources: scikit-learn #33127 (weighted-percentile-zero-weight)

Everything quoted in `about.json` must appear word for word below. Fetched on 2026-10-11 from a git clone of https://github.com/scikit-learn/scikit-learn (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).

Made on 2026-10-11 by `python3 -I apps/web/scripts/make-sklearn-sources.py <scikit-learn clone> content/scikit-learn 2026-10-11` (clone at `102e5daf66759cf896beeee229d1bf7c80ab2ba4`).

## What could not be fetched

- The pull request page (https://github.com/scikit-learn/scikit-learn/pull/33127), its description, review comments and any linked issue: github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.
- An issue number: the commit message, the changelog entry and the test name none.

## The merge commit message

Commit `128c88c4b91e0fad2bcc664e4c2300804859f981` by Arthur Lacote, 2026-01-27. https://github.com/scikit-learn/scikit-learn/commit/128c88c4b91e0fad2bcc664e4c2300804859f981

```text
FIX: fix boundary 0-weight edge-case in `_weighted_percentile` (#33127)

Co-authored-by: Lucy Liu <jliu176@gmail.com>
```

## The changelog entry (`doc/whats_new/upcoming_changes/sklearn.utils/33127.fix.rst`)

https://github.com/scikit-learn/scikit-learn/blob/128c88c4b91e0fad2bcc664e4c2300804859f981/doc/whats_new/upcoming_changes/sklearn.utils/33127.fix.rst

```rst
- Fixed ``_weighted_percentile`` with ``average=True`` so zero-weight samples
   just before the end of the array are handled correctly. This
  can change results when using ``sample_weight`` with
  :class:`preprocessing.KBinsDiscretizer` (``strategy="quantile"``,
  ``quantile_method="averaged_inverted_cdf"``) and in
  :func:`metrics.median_absolute_error`, :func:`metrics.d2_pinball_score`, and
  :func:`metrics.d2_absolute_error_score`.
  By :user:`Arthur Lacote <cakedev0>`.
```

## The test changes in the fix (`sklearn/utils/tests/test_stats.py`)

https://github.com/scikit-learn/scikit-learn/commit/128c88c4b91e0fad2bcc664e4c2300804859f981

```diff
diff --git a/sklearn/utils/tests/test_stats.py b/sklearn/utils/tests/test_stats.py
index 60e1c2acc..bdd2ba242 100644
--- a/sklearn/utils/tests/test_stats.py
+++ b/sklearn/utils/tests/test_stats.py
@@ -130,6 +130,13 @@ def test_weighted_percentile_ignores_zero_weight(
         assert approx(value[idx]) == expected_value
 
 
+def test_weighted_percentile_average_zero_weight_plateau():
+    """Check zero weights just before `max_index` handled correctly."""
+    score_without_zeros = _weighted_percentile([1, 3], [3, 3], average=True)
+    score_with_zeros = _weighted_percentile([1, 2, 3], [3, 0, 3], average=True)
+    assert approx(score_without_zeros) == score_with_zeros
+
+
 @pytest.mark.parametrize("average", [True, False])
 @pytest.mark.parametrize("percentile_rank", [20, 35, 50, 61])
 def test_weighted_percentile_frequency_weight_semantics(
```

## Docstring of `_weighted_percentile` in scikit-learn 1.8.0 (`sklearn/utils/stats.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/utils/stats.py

```text
Compute the weighted percentile.

Implement an array API compatible (weighted version) of NumPy's 'inverted_cdf'
method when `average=False` (default) and 'averaged_inverted_cdf' when
`average=True`.

For an array ordered by increasing values, when the percentile lies exactly on a
data point:

* 'inverted_cdf' takes the exact data point.
* 'averaged_inverted_cdf' takes the average of the exact data point and the one
  above it (this means it gives the same result as `median` for unit weights).

E.g., for the array [1, 2, 3, 4] the percentile rank at each data point would
be [25, 50, 75, 100]. Percentile rank 50 lies on '2'. 'average_inverted_cdf'
computes the average of '2' and '3', making it 'symmetrical' because if you
reverse the array, rank 50 would fall on '3'. It also matches 'median'.
On the other hand, 'inverted_cdf', which does not satisfy the symmetry property,
would give '2'.

When the requested percentile lies between two data points, both methods return
the higher data point.
E.g., for the array [1, 2, 3, 4, 5] the percentile rank at each data point would
be [20, 40, 60, 80, 100]. Percentile rank 50, lies between '2' and '3'. Taking the
higher data point is symmetrical because if you reverse the array, 50 would lie
between '4' and '3'. Both methods match median in this case.

If `array` is a 2D array, the `values` are selected along axis 0.

`NaN` values are ignored by setting their weights to 0. If `array` is 2D, this
is done in a column-isolated manner: a `NaN` in the second column, does not impact
the percentile computed for the first column even if `sample_weight` is 1D.

    .. versionchanged:: 0.24
        Accepts 2D `array`.

    .. versionchanged:: 1.7
        Supports handling of `NaN` values.

    .. versionchanged:: 1.8
        Supports `average`, which calculates percentile using the
        "averaged_inverted_cdf" method.

Parameters
----------
array : 1D or 2D array
    Values to take the weighted percentile of.

sample_weight: 1D or 2D array
    Weights for each value in `array`. Must be same shape as `array` or of shape
    `(array.shape[0],)`.

percentile_rank: scalar or 1D array, default=50
    The probability level(s) of the percentile(s) to compute, in percent. Must be
    between 0 and 100. If a 1D array, computes all percentiles (along each
    axis 0 if `array` is 2D).

average : bool, default=False
    If `True`, uses the "averaged_inverted_cdf" quantile method, otherwise
    defaults to "inverted_cdf". "averaged_inverted_cdf" is symmetrical with
    unit `sample_weight`, such that the total of `sample_weight` below or equal to
    `_weighted_percentile(percentile_rank)` is the same as the total of
    `sample_weight` above or equal to `_weighted_percentile(100-percentile_rank)`.
    This symmetry is not guaranteed with non-unit weights.

xp : array_namespace, default=None
    The standard-compatible namespace for `array`. Default: infer.

Returns
-------
percentile : scalar, 1D array, or 2D array
    Weighted percentile at the requested probability level(s).
    If `array` is 1D and `percentile_rank` is scalar, returns a scalar.
    If `array` is 2D and `percentile_rank` is scalar, returns a 1D array
        of shape `(array.shape[1],)`
    If `array` is 1D and `percentile_rank` is 1D, returns a 1D array
        of shape `(percentile_rank.shape[0],)`
    If `array` is 2D and `percentile_rank` is 1D, returns a 2D array
        of shape `(array.shape[1], percentile_rank.shape[0])`
```
