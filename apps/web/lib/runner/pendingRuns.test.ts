import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingRuns } from "./pendingRuns";
import type { RunResult } from "./types";

const result: RunResult = { results: [{ id: "t", outcome: "passed" }], error: null, durationMs: 5 };

describe("PendingRuns (useTestRunner's bookkeeping)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a run with the worker's reply and clears its timer", async () => {
    const runs = new PendingRuns();
    const onTimeout = vi.fn();
    const { id, promise } = runs.add(60_000, onTimeout);
    expect(runs.settle(id, { result })).toBe(true);
    await expect(promise).resolves.toEqual(result);
    vi.advanceTimersByTime(120_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(runs.size).toBe(0);
  });

  it("rejects with the worker's error", async () => {
    const runs = new PendingRuns();
    const { id, promise } = runs.add(60_000, () => {});
    runs.settle(id, { error: "boom" });
    await expect(promise).rejects.toThrow("boom");
  });

  it("times out after the limit, calls onTimeout once, and ignores a late reply", async () => {
    const runs = new PendingRuns();
    const onTimeout = vi.fn();
    const { id, promise } = runs.add(60_000, onTimeout);
    vi.advanceTimersByTime(59_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toThrow(/longer than 60 seconds/);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(runs.settle(id, { result })).toBe(false);
  });

  it("rejectAll (restart or page closed) rejects every run and no timer fires afterwards", async () => {
    const runs = new PendingRuns();
    const onTimeout = vi.fn();
    const a = runs.add(60_000, onTimeout);
    const b = runs.add(120_000, onTimeout);
    runs.rejectAll(new Error("The page was closed"));
    await expect(a.promise).rejects.toThrow("The page was closed");
    await expect(b.promise).rejects.toThrow("The page was closed");
    vi.advanceTimersByTime(200_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(runs.settle(a.id, { result })).toBe(false);
  });
});
