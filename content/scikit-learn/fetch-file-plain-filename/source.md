# Sources: scikit-learn #34815 (fetch-file-plain-filename)

Everything quoted in `about.json` must appear word for word below. Fetched on 2026-10-11 from a git clone of https://github.com/scikit-learn/scikit-learn (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).

Made on 2026-10-11 by `python3 -I apps/web/scripts/make-sklearn-sources.py <scikit-learn clone> content/scikit-learn 2026-10-11` (clone at `102e5daf66759cf896beeee229d1bf7c80ab2ba4`).

## What could not be fetched

- The pull request page (https://github.com/scikit-learn/scikit-learn/pull/34815), its description, review comments and any linked issue: github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.
- An issue number: the commit message, the changelog entry and the test name none.

## The merge commit message

Commit `aab0d04a858ed2d9391b130a764ad23818b5d0a4` by Dea María Léon, 2026-08-27. https://github.com/scikit-learn/scikit-learn/commit/aab0d04a858ed2d9391b130a764ad23818b5d0a4

```text
MNT Raise ValueError if  `local_filename` is not a plain filename in `sklearn.datasets.fetch_file` (#34815)
```

## The changelog entry (`doc/whats_new/upcoming_changes/sklearn.datasets/34815.fix.rst`)

https://github.com/scikit-learn/scikit-learn/blob/aab0d04a858ed2d9391b130a764ad23818b5d0a4/doc/whats_new/upcoming_changes/sklearn.datasets/34815.fix.rst

```rst
- :func:`datasets.fetch_file` now raises a `ValueError` when `local_filename`
  is a path instead of a plain filename.
  By :user:`Dea María Léon <DeaMariaLeon>`.
```

## The test changes in the fix (`sklearn/datasets/tests/test_base.py`)

https://github.com/scikit-learn/scikit-learn/commit/aab0d04a858ed2d9391b130a764ad23818b5d0a4

```diff
diff --git a/sklearn/datasets/tests/test_base.py b/sklearn/datasets/tests/test_base.py
index a880d3cb7..dae303bf2 100644
--- a/sklearn/datasets/tests/test_base.py
+++ b/sklearn/datasets/tests/test_base.py
@@ -657,3 +657,71 @@ def test_fetch_file_with_sha256(monkeypatch, tmpdir):
                 folder=client_side,
                 sha256=non_matching_sha256,
             )
+
+
+@pytest.mark.parametrize(
+    "local_filename",
+    [
+        "../escaped.jsonl",
+        "subfolder/data.jsonl",
+        "/absolute/data.jsonl",
+        "subfolder/",
+        "/absolute/dir/",
+        "../",
+        "./",
+        "..",
+        ".",
+        "",
+    ],
+)
+def test_fetch_file_rejects_path_as_local_filename(monkeypatch, tmpdir, local_filename):
+    # Non-regression test: a path-like `local_filename` must be rejected instead
+    # of silently writing outside of `folder`.
+    client_side = Path(tmpdir.mkdir("client_side"))
+
+    urlretrieve_mock = Mock()
+    monkeypatch.setattr("sklearn.datasets._base.urlretrieve", urlretrieve_mock)
+
+    expected_error_msg = re.escape(
+        "`local_filename` should be a filename, not a path, got"
+        f" {local_filename!r}. Use the `folder` argument to control the"
+        " output folder."
+    )
+    with pytest.raises(ValueError, match=expected_error_msg):
+        fetch_file(
+            "https://example.com/data.jsonl",
+            folder=client_side,
+            local_filename=local_filename,
+        )
+
+    # The check happens before any download and nothing is written to disk.
+    assert urlretrieve_mock.call_count == 0
+    assert list(Path(tmpdir).rglob("*")) == [client_side]
+
+
+@pytest.mark.parametrize(
+    "local_filename",
+    [
+        "renamed.jsonl",
+        ".hidden.jsonl",
+        "data..jsonl",
+    ],
+)
+def test_fetch_file_accepts_plain_local_filename(monkeypatch, tmpdir, local_filename):
+    server_side = tmpdir.mkdir("server_side")
+    server_data = '{"a": 1, "b": 2}\n'
+    Path(server_side / "data.jsonl").write_text(server_data, encoding="utf-8")
+
+    client_side = Path(tmpdir.mkdir("client_side"))
+
+    monkeypatch.setattr(
+        "sklearn.datasets._base.urlretrieve", _mock_urlretrieve(server_side)
+    )
+
+    fetched_file_path = fetch_file(
+        "https://example.com/data.jsonl",
+        folder=client_side,
+        local_filename=local_filename,
+    )
+    assert fetched_file_path == client_side / local_filename
+    assert fetched_file_path.read_text(encoding="utf-8") == server_data
```

## Docstring of `fetch_file` in scikit-learn 1.8.0 (`sklearn/datasets/_base.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/datasets/_base.py

```text
Fetch a file from the web if not already present in the local folder.

If the file already exists locally (and the SHA256 checksums match when
provided), the path to the local file is returned without re-downloading.

.. versionadded:: 1.6

Parameters
----------
url : str
    URL of the file to download.

folder : str or Path, default=None
    Directory to save the file to. If None, the file is downloaded in a
    folder with a name derived from the URL host name and path under
    scikit-learn data home folder.

local_filename : str, default=None
    Name of the file to save. If None, the filename is inferred from the
    URL.

sha256 : str, default=None
    SHA256 checksum of the file. If None, no checksum is verified.

n_retries : int, default=3
    Number of retries when HTTP errors are encountered.

delay : int, default=1
    Number of seconds between retries.

Returns
-------
file_path : Path
    Full path of the downloaded file.
```
