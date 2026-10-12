/**
 * The scikit-learn track's tasks, read from content/scikit-learn at build time (the pages are static, so
 * this runs during `next build`, never in the browser). Generated files come from
 * scripts/build-sklearn-tasks.ts; about.json is written by hand.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TaskCoach } from "./coach/types";
import type { OfflineData } from "./runner/types";
import type { SklearnSources, SklearnTask } from "./sklearn/taskRules";

/** content/scikit-learn/<slug>/about.json: what the task teaches and the real context. */
export interface TaskAbout {
  title: string;
  teaches: string;
  summary: string;
  quotes: Array<{ text: string; source: string; url: string }>;
  whereToLook: { file: string; symbol: string; hint: string };
  pr: { number: number; url: string };
  issue: { number: number; url: string; fetched: boolean } | null;
}

/** What the path page shows for a task. */
export interface TaskSummary {
  slug: string;
  pr: number;
  title: string;
  teaches: string;
  file: string;
  fixSize: { added: number; removed: number };
}

/** Everything the task page needs. */
export interface TaskDetail extends TaskSummary {
  about: TaskAbout;
  testFile: string;
  failToPass: string[];
  passToPass: string[];
  offlineData: OfflineData[];
  baseTag: string;
  /** The student's starting file, exactly as shipped in scikit-learn 1.8.0. */
  before: string;
  /** The PR's version of the test file (read-only for the student). */
  tests: string;
  /** The real fix, shown only after solving. */
  fixDiff: string;
  /** The coach's questions and changelog details (coach.json). */
  coach: TaskCoach;
}

/** content/scikit-learn, found from the app folder (next build, next dev) or the repo root (Vitest). */
export function contentDir(): string {
  for (const base of [process.cwd(), path.resolve(process.cwd(), "../..")]) {
    const dir = path.join(base, "content/scikit-learn");
    if (existsSync(path.join(dir, "sources.json"))) return dir;
  }
  throw new Error(`content/scikit-learn not found from ${process.cwd()}`);
}

const readJson = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;

function summary(dir: string, slug: string): TaskSummary {
  const task = readJson<SklearnTask>(path.join(dir, slug, "task.json"));
  const about = readJson<TaskAbout>(path.join(dir, slug, "about.json"));
  return { slug, pr: task.pr, title: about.title, teaches: about.teaches, file: task.file, fixSize: task.fixSize };
}

/** The tasks in the suggested order (sources.json lists them smallest fix first). */
export function listTasks(dir = contentDir()): TaskSummary[] {
  const sources = readJson<SklearnSources>(path.join(dir, "sources.json"));
  if (sources.tasks.length === 0) throw new Error(`${dir}/sources.json lists no tasks`);
  return sources.tasks.map((t) => summary(dir, t.slug));
}

export function getTask(slug: string, dir = contentDir()): TaskDetail | null {
  if (!listTasks(dir).some((t) => t.slug === slug)) return null;
  const read = (f: string) => readFileSync(path.join(dir, slug, f), "utf8");
  const task = readJson<SklearnTask>(path.join(dir, slug, "task.json"));
  return {
    ...summary(dir, slug),
    about: readJson<TaskAbout>(path.join(dir, slug, "about.json")),
    testFile: task.testFile,
    failToPass: task.failToPass,
    passToPass: task.passToPass,
    offlineData: task.offlineData ?? [],
    baseTag: task.base.tag,
    before: read(`before/${task.file}`),
    tests: read(`tests/${task.testFile}`),
    fixDiff: read("fix.diff"),
    coach: readJson<TaskCoach>(path.join(dir, slug, "coach.json")),
  };
}
