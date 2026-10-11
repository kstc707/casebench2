import { describe, expect, it } from "vitest";
import {
  draftKey,
  markInProgress,
  markSolved,
  PROGRESS_KEY,
  readDraft,
  readProgress,
  solvedCount,
  statusOf,
  writeDraft,
  type StorageLike,
} from "./progress";

function memory(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("progress", () => {
  it("saves and reads back: not started → in progress → solved, and solved stays solved", () => {
    const s = memory();
    expect(statusOf(readProgress(s), "a")).toBe("not-started");
    markInProgress("a", s);
    expect(statusOf(readProgress(s), "a")).toBe("in-progress");
    markSolved("a", new Date("2026-10-11T12:00:00Z"), s);
    markInProgress("a", s);
    const p = readProgress(s);
    expect(p.tasks.a).toEqual({ status: "solved", solvedAt: "2026-10-11T12:00:00.000Z" });
    expect(JSON.parse(s.data.get(PROGRESS_KEY)!)).toEqual({ version: 1, tasks: { a: { status: "solved", solvedAt: "2026-10-11T12:00:00.000Z" } } });
  });

  it("counts solved tasks among the given ones", () => {
    const s = memory();
    markSolved("a", new Date(), s);
    markSolved("b", new Date(), s);
    markInProgress("c", s);
    markSolved("old-task", new Date(), s);
    expect(solvedCount(readProgress(s), ["a", "b", "c", "d", "e"])).toBe(2);
  });

  it.each([
    ["not JSON", "{oops"],
    ["another version", JSON.stringify({ version: 2, tasks: { a: { status: "solved" } } })],
    ["tasks is a list", JSON.stringify({ version: 1, tasks: ["a"] })],
    ["null", "null"],
  ])("treats corrupt data (%s) as a fresh start, and can save over it", (_, raw) => {
    const s = memory({ [PROGRESS_KEY]: raw });
    expect(readProgress(s)).toEqual({ version: 1, tasks: {} });
    markSolved("a", new Date(), s);
    expect(statusOf(readProgress(s), "a")).toBe("solved");
  });

  it("drops entries with an unknown status, keeping the good ones", () => {
    const s = memory({ [PROGRESS_KEY]: JSON.stringify({ version: 1, tasks: { a: { status: "hacked" }, b: { status: "in-progress" }, c: null } }) });
    expect(readProgress(s).tasks).toEqual({ b: { status: "in-progress" } });
  });

  it("never crashes when storage throws or is missing: everything reads as fresh", () => {
    for (const s of [throwing, null]) {
      expect(readProgress(s)).toEqual({ version: 1, tasks: {} });
      expect(() => markSolved("a", new Date(), s)).not.toThrow();
      expect(statusOf(markInProgress("a", s), "a")).toBe("in-progress"); // in memory for this page view
      expect(readDraft("a", s)).toBeNull();
      expect(writeDraft("a", "x", s)).toBe(false);
    }
  });
});

describe("drafts", () => {
  it("are saved per task under a versioned key and removed with null", () => {
    const s = memory();
    expect(writeDraft("a", "x = 1\n", s)).toBe(true);
    expect(s.data.get(draftKey("a"))).toBe("x = 1\n");
    expect(draftKey("a")).toBe("casebench2.draft.v1.a");
    expect(readDraft("a", s)).toBe("x = 1\n");
    expect(readDraft("b", s)).toBeNull();
    writeDraft("a", null, s);
    expect(readDraft("a", s)).toBeNull();
  });
});
