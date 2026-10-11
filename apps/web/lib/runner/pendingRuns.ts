/**
 * The bookkeeping behind useTestRunner, kept free of React and workers so it can be unit-tested: each
 * run waiting for the worker's reply, with its own time limit. A run settles exactly once: with the
 * worker's reply, with a timeout, or when everything is rejected (Python restarted, page closed).
 */
import type { RunResult } from "./types";

interface Entry {
  resolve: (r: RunResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PendingRuns {
  private entries = new Map<number, Entry>();
  private nextId = 1;

  /** How many runs are waiting. */
  get size() {
    return this.entries.size;
  }

  /**
   * Registers a run and starts its time limit now. After limitMs without a reply, the run is rejected
   * with a timeout error and onTimeout is called (to restart Python).
   */
  add(limitMs: number, onTimeout: () => void): { id: number; promise: Promise<RunResult> } {
    const id = this.nextId++;
    const promise = new Promise<RunResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.entries.delete(id)) return;
        reject(new Error(`The tests took longer than ${limitMs / 1000} seconds and were stopped. Is there an infinite loop?`));
        onTimeout();
      }, limitMs);
      this.entries.set(id, { resolve, reject, timer });
    });
    return { id, promise };
  }

  /** Settles a run with the worker's reply. Returns false for an unknown (already settled) id. */
  settle(id: number, reply: { result?: RunResult; error?: string }): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    this.entries.delete(id);
    clearTimeout(e.timer);
    if (reply.result) e.resolve(reply.result);
    else e.reject(new Error(reply.error ?? "The test run failed"));
    return true;
  }

  /** Rejects every waiting run and clears every timer. */
  rejectAll(error: Error) {
    const all = [...this.entries.values()];
    this.entries.clear();
    for (const e of all) {
      clearTimeout(e.timer);
      e.reject(error);
    }
  }
}
