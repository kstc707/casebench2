/**
 * What the coach keeps in this browser (localStorage only; guarded like lib/progress.ts: missing,
 * blocked or corrupt storage means "start fresh", never a crash).
 *
 *   casebench2.coach.v1.<slug>     the PR form, changelog fragment, answers, self-check ticks, review log
 *   casebench2.anthropicKey.v1     the student's Anthropic API key, only if they choose to save it
 */
import { browserStorage, type StorageLike } from "../progress";
import { EMPTY_PR, type PrForm } from "./checks";
import type { CoachLogEntry } from "./review";

export const coachKey = (slug: string) => `casebench2.coach.v1.${slug}`;
export const API_KEY_KEY = "casebench2.anthropicKey.v1";

export interface CoachState {
  pr: PrForm;
  changelog: string;
  answers: Record<string, string>;
  /** Per question: the key point ids the student ticked as covered (self-check). */
  ticks: Record<string, string[]>;
  log: CoachLogEntry[];
}

export const emptyCoachState = (): CoachState => ({ pr: { ...EMPTY_PR }, changelog: "", answers: {}, ticks: {}, log: [] });

const isStringRecord = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

export function readCoachState(slug: string, storage: StorageLike | null = browserStorage()): CoachState {
  try {
    const raw = storage?.getItem(coachKey(slug));
    if (!raw) return emptyCoachState();
    const s = JSON.parse(raw) as Partial<CoachState>;
    const fresh = emptyCoachState();
    return {
      pr: isStringRecord(s.pr) ? { ...fresh.pr, ...s.pr } : fresh.pr,
      changelog: typeof s.changelog === "string" ? s.changelog : "",
      answers: isStringRecord(s.answers) ? s.answers : {},
      ticks:
        s.ticks && typeof s.ticks === "object" && !Array.isArray(s.ticks)
          ? Object.fromEntries(Object.entries(s.ticks).filter(([, v]) => Array.isArray(v) && v.every((x) => typeof x === "string")))
          : {},
      log: Array.isArray(s.log) ? s.log : [],
    };
  } catch {
    return emptyCoachState();
  }
}

/** Returns false when it couldn't be saved. */
export function writeCoachState(slug: string, state: CoachState, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(coachKey(slug), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function readApiKey(storage: StorageLike | null = browserStorage()): string {
  try {
    return storage?.getItem(API_KEY_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Saves the key, or removes it with "". Returns false when it couldn't be saved. */
export function writeApiKey(key: string, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    if (key === "") storage.removeItem(API_KEY_KEY);
    else storage.setItem(API_KEY_KEY, key);
    return true;
  } catch {
    return false;
  }
}

/** The downloadable coach log for one task: every review with its inputs, outputs and the student's ratings. */
export function coachLogJson(slug: string, state: CoachState, exportedAt = new Date()): string {
  return JSON.stringify({ format: "casebench2.coach-log.v1", exportedAt: exportedAt.toISOString(), task: slug, reviews: state.log }, null, 2);
}
