import { describe, expect, it } from "vitest";
import { getTask, listTasks } from "./tasks";

describe("tasks (read from content/scikit-learn)", () => {
  it("lists the 5 tasks in the suggested order, smallest fix first", () => {
    const tasks = listTasks();
    expect(tasks.map((t) => t.pr)).toEqual([33127, 33643, 33176, 34815, 33362]);
    const sizes = tasks.map((t) => t.fixSize.added + t.fixSize.removed);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    for (const t of tasks) expect(t.title.length).toBeGreaterThan(5);
  });

  it("gives a task page everything it needs, and null for an unknown slug", () => {
    const t = getTask("weighted-percentile-zero-weight")!;
    expect(t.file).toBe("sklearn/utils/stats.py");
    expect(t.before).toContain("def _weighted_percentile(");
    expect(t.tests).toContain("def test_weighted_percentile_average_zero_weight_plateau");
    expect(t.fixDiff).toContain("+                if next_index > max_idx:");
    expect(t.failToPass).toHaveLength(1);
    expect(getTask("reconstruct-patches-full-size")!.offlineData).toEqual(["raccoon_face"]);
    expect(getTask("../etc")).toBeNull();
  });
});
