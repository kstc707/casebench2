/**
 * The student's progress and drafts, kept in this browser's localStorage only (no accounts in this
 * section). Every read and write is guarded: storage that is missing, blocked, full or holding
 * corrupt data means "start fresh", never a crash.
 *
 *   casebench2.progress.v1        {"version":1,"tasks":{"<slug>":{"status":"in-progress"|"solved","solvedAt"?}}}
 *   casebench2.draft.v1.<slug>    the student's edited file, while it differs from the original
 */
export const PROGRESS_KEY = "casebench2.progress.v1";
export const draftKey = (slug: string) => `casebench2.draft.v1.${slug}`;

export type TaskStatus = "not-started" | "in-progress" | "solved";

export interface Progress {
  version: 1;
  tasks: Record<string, { status: "in-progress" | "solved"; solvedAt?: string }>;
}

/** The part of localStorage we use, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** This browser's localStorage, or null where there is none or it is blocked. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // e.g. blocked cookies throw on access
  }
}

const empty = (): Progress => ({ version: 1, tasks: {} });

function get(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the write didn't happen (no storage, blocked, full). */
function put(storage: StorageLike | null, key: string, value: string | null): boolean {
  try {
    if (!storage) return false;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readProgress(storage: StorageLike | null = browserStorage()): Progress {
  const raw = get(storage, PROGRESS_KEY);
  if (!raw) return empty();
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p?.version !== 1 || !p.tasks || typeof p.tasks !== "object" || Array.isArray(p.tasks)) return empty();
    const tasks: Progress["tasks"] = {};
    for (const [slug, t] of Object.entries(p.tasks)) {
      if (t && (t.status === "in-progress" || t.status === "solved")) {
        tasks[slug] = t.status === "solved" && typeof t.solvedAt === "string" ? { status: "solved", solvedAt: t.solvedAt } : { status: t.status };
      }
    }
    return { version: 1, tasks };
  } catch {
    return empty();
  }
}

export function statusOf(progress: Progress, slug: string): TaskStatus {
  return progress.tasks[slug]?.status ?? "not-started";
}

export function solvedCount(progress: Progress, slugs: string[]): number {
  return slugs.filter((s) => statusOf(progress, s) === "solved").length;
}

/** Marks a task started (never downgrades a solved one). */
export function markInProgress(slug: string, storage: StorageLike | null = browserStorage()): Progress {
  const p = readProgress(storage);
  if (statusOf(p, slug) === "not-started") {
    p.tasks[slug] = { status: "in-progress" };
    put(storage, PROGRESS_KEY, JSON.stringify(p));
  }
  return p;
}

export function markSolved(slug: string, now = new Date(), storage: StorageLike | null = browserStorage()): Progress {
  const p = readProgress(storage);
  if (statusOf(p, slug) !== "solved") {
    p.tasks[slug] = { status: "solved", solvedAt: now.toISOString() };
    put(storage, PROGRESS_KEY, JSON.stringify(p));
  }
  return p;
}

export function readDraft(slug: string, storage: StorageLike | null = browserStorage()): string | null {
  return get(storage, draftKey(slug));
}

/** Saves a draft; null (or the original text) removes it. Returns false when it couldn't be saved. */
export function writeDraft(slug: string, text: string | null, storage: StorageLike | null = browserStorage()): boolean {
  return put(storage, draftKey(slug), text);
}
