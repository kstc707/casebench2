"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * request. A run that takes longer than its limit (60 s for the issue's tests, 120 s for "Check my
 * fix") is stopped and Python restarted.
 */
export function useTestRunner() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (r: RunResult) => void; reject: (e: Error) => void }>());
  const nextId = useRef(1);
  const [state, setState] = useState<RunnerState>("loading");
  const [stage, setStage] = useState<LoadingStage>("python");
  const [versions, setVersions] = useState<RunnerVersions | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const start = useCallback(() => {
    worker.current?.terminate();
    for (const p of pending.current.values()) p.reject(new Error("Python was restarted"));
    pending.current.clear();
    setState("loading");
    setStage("python");
    setBootError(null);
    // A module worker served as-is next to Pyodide (see scripts/runner-worker.mjs).
    const w = new Worker("/pyodide/runner-worker.mjs", { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
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
      const p = pending.current.get(d.id);
      if (!p) return;
      pending.current.delete(d.id);
      if (d.result) p.resolve(d.result);
      else p.reject(new Error(d.error ?? "The test run failed"));
    };
    w.onerror = (e) => {
      setBootError(e.message || "The test runner couldn't start");
      setState("failed");
    };
    worker.current = w;
  }, []);

  useEffect(() => {
    start();
    return () => worker.current?.terminate();
  }, [start]);

  const run = useCallback(
    (files: Record<string, string>, testIds: string[], kind: RunKind): Promise<RunResult> => {
      const w = worker.current;
      if (!w) return Promise.reject(new Error("Python isn't running"));
      const id = nextId.current++;
      const limit = RUN_TIMEOUT_MS[kind];
      setState("running");
      return new Promise<RunResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error(`The tests took longer than ${limit / 1000} seconds and were stopped. Is there an infinite loop?`));
          start(); // the worker is stuck: start a fresh Python
        }, limit);
        pending.current.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            setState("ready");
            resolve(r);
          },
          reject: (e) => {
            clearTimeout(timer);
            setState((s) => (s === "running" ? "ready" : s));
            reject(e);
          },
        });
        w.postMessage({ id, files, testIds });
      });
    },
    [start]
  );

  return { state, stage, versions, bootError, run, restart: start };
}
