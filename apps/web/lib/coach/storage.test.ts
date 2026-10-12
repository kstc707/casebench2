import { describe, expect, it } from "vitest";
import type { StorageLike } from "../progress";
import { API_KEY_KEYS, coachKey, coachLogJson, emptyCoachState, readApiKey, readCoachState, writeApiKey, writeCoachState } from "./storage";

function memory(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const throwing: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("coach state", () => {
  it("saves and reads back per task", () => {
    const s = memory();
    const state = { ...emptyCoachState(), changelog: "- x", answers: { why: "because" }, ticks: { why: ["a"] } };
    state.pr.reference = "Fixes #1";
    expect(writeCoachState("t", state, s)).toBe(true);
    expect(readCoachState("t", s)).toEqual(state);
    expect(readCoachState("other", s)).toEqual(emptyCoachState());
    expect(s.data.has(coachKey("t"))).toBe(true);
  });

  it("starts fresh on corrupt data and keeps the good parts of a bad shape", () => {
    expect(readCoachState("t", memory({ [coachKey("t")]: "{oops" }))).toEqual(emptyCoachState());
    const odd = memory({ [coachKey("t")]: JSON.stringify({ pr: { reference: 5 }, changelog: "- ok", answers: ["x"], ticks: { q: "nope", r: ["a"] }, log: "x" }) });
    expect(readCoachState("t", odd)).toEqual({ ...emptyCoachState(), changelog: "- ok", ticks: { r: ["a"] } });
  });

  it("never crashes when storage throws or is missing", () => {
    for (const s of [throwing, null]) {
      expect(readCoachState("t", s)).toEqual(emptyCoachState());
      expect(writeCoachState("t", emptyCoachState(), s)).toBe(false);
      expect(readApiKey("gemini", s)).toBe("");
      expect(writeApiKey("claude", "k", s)).toBe(false);
    }
  });
});

describe("the API keys", () => {
  it("are saved per provider only when asked, and forgotten with an empty string", () => {
    const s = memory();
    expect(readApiKey("gemini", s)).toBe("");
    writeApiKey("claude", "sk-ant-x", s);
    writeApiKey("gemini", "AIzaTEST", s);
    expect(s.data.get(API_KEY_KEYS.claude)).toBe("sk-ant-x");
    expect(s.data.get("casebench2.geminiKey.v1")).toBe("AIzaTEST");
    writeApiKey("claude", "", s);
    expect(s.data.has(API_KEY_KEYS.claude)).toBe(false);
    expect(readApiKey("gemini", s)).toBe("AIzaTEST");
  });
});

describe("coach log", () => {
  it("is versioned JSON with the task and every review", () => {
    const json = JSON.parse(coachLogJson("t", emptyCoachState(), new Date("2026-10-12T00:00:00Z")));
    expect(json).toEqual({ format: "casebench2.coach-log.v1", exportedAt: "2026-10-12T00:00:00.000Z", task: "t", reviews: [] });
  });
});
