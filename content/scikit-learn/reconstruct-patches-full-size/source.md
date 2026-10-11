# Sources: scikit-learn #33643 (reconstruct-patches-full-size)

Everything quoted in `about.json` must appear word for word below. Fetched on 2026-10-11 from a git clone of https://github.com/scikit-learn/scikit-learn (through this sandbox's proxy). Docstrings are shown as Python reads them (indentation removed, and a backslash at a line end joins the lines).

## What could not be fetched

- The pull request page (https://github.com/scikit-learn/scikit-learn/pull/33643), its description, review comments and any linked issue: github.com pages and api.github.com answer 403 in this sandbox, so none of that text is here or quoted.
- The issue the fix's test names (https://github.com/scikit-learn/scikit-learn/issues/10910): its page is blocked too. The commit message and changelog entry name no issue.

## The merge commit message

Commit `d9a1b74f0d39ed655d7ddfe2a4303f40002ec1f8` by EdenRochmanSharabi, 2026-04-09. https://github.com/scikit-learn/scikit-learn/commit/d9a1b74f0d39ed655d7ddfe2a4303f40002ec1f8

```text
FIX reconstruct_from_patches_2d when patch size equals image size (#33643)

Co-authored-by: Jérémie du Boisberranger <jeremie@probabl.ai>
```

## The changelog entry (`doc/whats_new/upcoming_changes/sklearn.feature_extraction/33643.fix.rst`)

https://github.com/scikit-learn/scikit-learn/blob/d9a1b74f0d39ed655d7ddfe2a4303f40002ec1f8/doc/whats_new/upcoming_changes/sklearn.feature_extraction/33643.fix.rst

```rst
- :func:`feature_extraction.image.reconstruct_from_patches_2d` now produces
  correct results when a patch dimension equals the corresponding image
  dimension.
  By :user:`Eden Rochman <EdenRochmanSharabi>`.
```

## The test changes in the fix (`sklearn/feature_extraction/tests/test_image.py`)

https://github.com/scikit-learn/scikit-learn/commit/d9a1b74f0d39ed655d7ddfe2a4303f40002ec1f8

```diff
diff --git a/sklearn/feature_extraction/tests/test_image.py b/sklearn/feature_extraction/tests/test_image.py
index cb490fcd5..6d393a85f 100644
--- a/sklearn/feature_extraction/tests/test_image.py
+++ b/sklearn/feature_extraction/tests/test_image.py
@@ -14,6 +14,7 @@ from sklearn.feature_extraction.image import (
     img_to_graph,
     reconstruct_from_patches_2d,
 )
+from sklearn.utils._testing import assert_allclose
 
 
 def test_img_to_graph():
@@ -223,6 +224,28 @@ def test_reconstruct_patches_perfect_color(orange_face):
     np.testing.assert_array_almost_equal(face, face_reconstructed)
 
 
+@pytest.mark.parametrize(
+    "image_size, patch_size",
+    [
+        ((128, 256), (128, 128)),  # patch_h == image_h
+        ((256, 128), (128, 128)),  # patch_w == image_w
+        ((128, 128), (128, 128)),  # patch == image
+        ((128, 256, 3), (128, 128)),  # patch_h == image_h, with channels
+    ],
+)
+def test_reconstruct_patches_edge_patch_size(image_size, patch_size):
+    """Check that reconstruct_from_patches_2d works when a patch dimension
+    equals the corresponding image dimension.
+
+    Non-regression test for https://github.com/scikit-learn/scikit-learn/issues/10910
+    """
+    rng = np.random.RandomState(0)
+    image = rng.rand(*image_size)
+    patches = extract_patches_2d(image, patch_size)
+    reconstructed = reconstruct_from_patches_2d(patches, image_size)
+    assert_allclose(image, reconstructed)
+
+
 def test_patch_extractor_fit(downsampled_face_collection, global_random_seed):
     faces = downsampled_face_collection
     extr = PatchExtractor(
```

## Docstring of `reconstruct_from_patches_2d` in scikit-learn 1.8.0 (`sklearn/feature_extraction/image.py`)

https://github.com/scikit-learn/scikit-learn/blob/1.8.0/sklearn/feature_extraction/image.py

```text
Reconstruct the image from all of its patches.

Patches are assumed to overlap and the image is constructed by filling in
the patches from left to right, top to bottom, averaging the overlapping
regions.

Read more in the :ref:`User Guide <image_feature_extraction>`.

Parameters
----------
patches : ndarray of shape (n_patches, patch_height, patch_width) or         (n_patches, patch_height, patch_width, n_channels)
    The complete set of patches. If the patches contain colour information,
    channels are indexed along the last dimension: RGB patches would
    have `n_channels=3`.

image_size : tuple of int (image_height, image_width) or         (image_height, image_width, n_channels)
    The size of the image that will be reconstructed.

Returns
-------
image : ndarray of shape image_size
    The reconstructed image.

Examples
--------
>>> from sklearn.datasets import load_sample_image
>>> from sklearn.feature_extraction import image
>>> one_image = load_sample_image("china.jpg")
>>> print('Image shape: {}'.format(one_image.shape))
Image shape: (427, 640, 3)
>>> image_patches = image.extract_patches_2d(image=one_image, patch_size=(10, 10))
>>> print('Patches shape: {}'.format(image_patches.shape))
Patches shape: (263758, 10, 10, 3)
>>> image_reconstructed = image.reconstruct_from_patches_2d(
...     patches=image_patches,
...     image_size=one_image.shape
... )
>>> print(f"Reconstructed shape: {image_reconstructed.shape}")
Reconstructed shape: (427, 640, 3)
```
