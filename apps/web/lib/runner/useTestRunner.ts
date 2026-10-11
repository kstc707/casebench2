"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PendingRuns } from "./pendingRuns";
import { RUN_TIMEOUT_MS, type RunKind, type RunResult, type RunnerVersions } from "./types";

/** "loading" includes downloading Python and scikit-learn (about 39 MB, once) and the first import. */
export type RunnerState = "loading" | "ready" | "running" | "failed";

/** Which part of loading is under way, for the progress message. */
export type LoadingStage = "python" | "packages" | "importing";

type WorkerMessage =
  | { type: "progress"; stage: LoadingStage }
  | { type: "ready"; versions: RunnerVersions }
  | { type: "boot-error"; error: string }
  | { type?: undefined; id: number; result?: RunResult; error?: string };

/**
 * Starts Python (Pyodide) in a background module worker as soon as the page opens, and runs tests on
 * request, one at a time and only once Python is ready (so a run's time limit never counts the
 * download or start-up). A run that takes longer than its limit (60 s for the issue's tests, 120 s
 * for "Check my fix") is stopped and Python restarted.
 */
export function useTestRunner() {
  const worker = useRef<Worker | null>(null);
  const runs = useRef(new PendingRuns());
  const disposed = useRef(false);
  const stateRef = useRef<RunnerState>("loading");
  const [state, setStateValue] = useState<RunnerState>("loading");
  const [stage, setStage] = useState<LoadingStage>("python");
  const [versions, setVersions] = useState<RunnerVersions | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const setState = useCallback((s: RunnerState) => {
    stateRef.current = s;
    setStateValue(s);
  }, []);

  const start = useCallback(() => {
    if (disposed.current) return;
    worker.current?.terminate();
    runs.current.rejectAll(new Error("Python was restarted"));
    setState("loading");
    setStage("python");
    setBootError(null);
    // A module worker served as-is next to Pyodide (see scripts/runner-worker.mjs).
    const w = new Worker("/pyodide/runner-worker.mjs", { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (worker.current !== w) return; // a message from a worker we already stopped
      const d = e.data;
      if (d.type === "progress") return setStage(d.stage);
      if (d.type === "ready") {
        setVersions(d.versions);
        return setState("ready");
      }
      if (d.type === "boot-error") {
        setBootError(d.error || "Python failed to start");
        return setState("failed");
      }
      if (runs.current.settle(d.id, d) && stateRef.current === "running") setState("ready");
    };
    w.onerror = (e) => {
      if (worker.current !== w) return;
      setBootError(e.message || "The test runner couldn't start");
      runs.current.rejectAll(new Error("The test runner stopped"));
      setState("failed");
    };
    worker.current = w;
  }, [setState]);

  useEffect(() => {
    disposed.current = false;
    start();
    return () => {
      disposed.current = true;
      runs.current.rejectAll(new Error("The page was closed"));
      worker.current?.terminate();
      worker.current = null;
    };
  }, [start]);

  const run = useCallback(
    (files: Record<string, string>, testIds: string[], kind: RunKind): Promise<RunResult> => {
      const w = worker.current;
      const s = stateRef.current;
      if (!w || s !== "ready") {
        const why =
          s === "running" ? "Tests are already running; wait for them to finish." :
          s === "loading" ? "Python is still loading." :
          "Python isn't running.";
        return Promise.reject(new Error(why));
      }
      setState("running");
      // The time limit starts now, with Python ready: it never counts the download or start-up.
      const { id, promise } = runs.current.add(RUN_TIMEOUT_MS[kind], () => {
        if (!disposed.current) start(); // the worker is stuck: start a fresh Python
      });
      w.postMessage({ id, files, testIds });
      return promise;
    },
    [setState, start]
  );

  return { state, stage, versions, bootError, run, restart: start };
}
