/**
 * Types shared by both sides of the test runner: the Node side (runner.ts, used by CI and the task
 * builder) and the browser side (useTestRunner.ts, which talks to scripts/runner-worker.mjs). The test
 * logic itself is runner.py, which both load, so a task is always tested the same way.
 */

/** The Pyodide release the files in public/pyodide/<version>/ come from (scripts/prepare-pyodide.mjs). */
export const PYODIDE_VERSION = "314.0.7";

/** What the runner loads into Pyodide; their dependencies come with them. */
export const RUNNER_PACKAGES = ["scikit-learn", "scikit-learn-tests", "pytest"];

export type TestOutcome = "passed" | "failed" | "skipped" | "missing";

export interface TestResult {
  id: string;
  outcome: TestOutcome;
  /** For failed tests: all of pytest's "E " lines and where it failed. */
  message?: string;
}

export interface RunResult {
  results: TestResult[];
  /** What stopped pytest from running the tests at all (e.g. a SyntaxError), else null. */
  error: string | null;
  /** When pytest couldn't collect the tests: the line of the student's file that broke, if found. */
  errorLine?: number;
  durationMs: number;
}

/**
 * Data some scikit-learn tests download, provided offline for the tasks that need it.
 * "raccoon_face": a synthetic stand-in for scipy.datasets.face (see runner.py).
 */
export type OfflineData = "raccoon_face";

export interface RunOptions {
  offlineData?: OfflineData[];
}

/** Versions reported once Python has started and imported everything. */
export interface RunnerVersions {
  python: string;
  sklearn: string;
  numpy: string;
  scipy: string;
  pytest: string;
}

/**
 * "issue": only the tests the real fix added (fast, for working on a fix).
 * "check": every required test in the file (the only run that can mark a task solved).
 */
export type RunKind = "issue" | "check";

/** A run that takes longer than this is stopped and Python restarted (e.g. an infinite loop). */
export const RUN_TIMEOUT_MS: Record<RunKind, number> = { issue: 60_000, check: 120_000 };
