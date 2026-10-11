/**
 * The Node side of the test runner (for CI and the task builder): starts Pyodide from the same
 * self-hosted files the browser uses (public/pyodide/<version>/, made by scripts/prepare-pyodide.mjs),
 * loads runner.py, and runs tests. The browser side is useTestRunner.ts + scripts/runner-worker.mjs.
 *
 * Runs happen on Node's main thread, so there is no timeout here: a hanging test hangs the caller
 * (Vitest's own test timeout stops it in CI).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PYODIDE_VERSION, RUNNER_PACKAGES, type RunResult, type RunnerVersions } from "./types";

/** Where `pnpm pyodide` puts Pyodide's files. */
export const DEFAULT_PYODIDE_DIR = path.resolve(__dirname, "../../public/pyodide", PYODIDE_VERSION);

/** The part of a loaded Pyodide the runner uses. */
export interface PyodideLike {
  loadPackage(names: string[], options?: { messageCallback?: (msg: string) => void }): Promise<unknown>;
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

export interface Runner {
  versions: RunnerVersions;
  /** Runs exactly these test ids with these files written over the installed scikit-learn files. */
  run(files: Record<string, string>, testIds: string[]): Promise<RunResult>;
  /** A file as shipped in the installed scikit-learn, e.g. "sklearn/utils/stats.py". */
  installedFile(file: string): string;
}

/** Loads runner.py into a Pyodide that already has RUNNER_PACKAGES, and does the slow first import. */
export async function prepareRunner(py: PyodideLike): Promise<Runner> {
  py.runPython(readFileSync(path.join(__dirname, "runner.py"), "utf8"));
  const versions = JSON.parse(String(py.runPython("_cb_warm_up()"))) as RunnerVersions;
  return {
    versions,
    async run(files, testIds) {
      py.globals.set("_cb_files", JSON.stringify(files));
      py.globals.set("_cb_ids", JSON.stringify(testIds));
      return JSON.parse(String(await py.runPythonAsync("_cb_run(_cb_files, _cb_ids)"))) as RunResult;
    },
    installedFile(file) {
      py.globals.set("_cb_path", file);
      return String(py.runPython("_cb_installed(_cb_path)"));
    },
  };
}

/** Starts a fresh Python with scikit-learn, its tests and pytest. Takes about 10-20 s. */
export async function startRunner(pyodideDir = DEFAULT_PYODIDE_DIR): Promise<Runner> {
  const entry = path.join(pyodideDir, "pyodide.mjs");
  if (!existsSync(entry)) {
    throw new Error(`${entry} is missing. Run \`pnpm --filter @casebench2/web pyodide\` first.`);
  }
  const { loadPyodide } = (await import(pathToFileURL(entry).href)) as {
    loadPyodide(options: { indexURL: string; stdout?: (s: string) => void; stderr?: (s: string) => void }): Promise<PyodideLike>;
  };
  const py = await loadPyodide({ indexURL: pyodideDir + path.sep, stdout: () => {}, stderr: () => {} });
  await py.loadPackage(RUNNER_PACKAGES, { messageCallback: () => {} });
  return prepareRunner(py);
}
