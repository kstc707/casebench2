"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CodeMirror, { EditorSelection, EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { markInProgress, markSolved, readDraft, readProgress, statusOf, writeDraft } from "../../lib/progress";
import { useTestRunner, type LoadingStage } from "../../lib/runner/useTestRunner";
import type { RunKind, RunResult, TestResult } from "../../lib/runner/types";
import { explainRunError, findSymbolLine, judgeCheck } from "../../lib/sklearn/runReport";
import type { TaskDetail } from "../../lib/tasks";

const LOADING: Record<LoadingStage, string> = {
  python: "Downloading Python and scikit-learn (about 39 MB, only once)…",
  packages: "Downloading Python and scikit-learn (about 39 MB, only once): unpacking scikit-learn and pytest…",
  importing: "Starting scikit-learn (the first start takes a few seconds)…",
};

const shortName = (id: string) => id.split("::").slice(1).join("::") || id;
const baseName = (f: string) => f.split("/").pop() ?? f;

interface LastRun {
  kind: RunKind;
  result: RunResult;
}

/** The task page's working area: the context on the left, the code and the two run buttons on the right. */
export function TaskWorkspace({ task }: { task: TaskDetail }) {
  const runner = useTestRunner();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const [code, setCode] = useState(task.before);
  const [tab, setTab] = useState<"file" | "tests">("file");
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [dark, setDark] = useState(false);
  const required = useMemo(() => [...task.failToPass, ...task.passToPass], [task]);

  // Restore the draft and the solved state (browser only).
  useEffect(() => {
    const draft = readDraft(task.slug);
    if (draft !== null && draft !== task.before) setCode(draft);
    setSolved(statusOf(readProgress(), task.slug) === "solved");
    setDark(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  }, [task.slug, task.before]);

  const onEdit = useCallback(
    (value: string) => {
      setCode(value);
      writeDraft(task.slug, value === task.before ? null : value);
      if (value !== task.before) markInProgress(task.slug);
    },
    [task.slug, task.before]
  );

  function reset() {
    if (!window.confirm(`Put back the original ${baseName(task.file)} from scikit-learn ${task.baseTag}? Your changes will be lost.`)) return;
    setCode(task.before);
    writeDraft(task.slug, null);
  }

  /** Scrolls the editor to a line of the student's file and puts the cursor there. */
  function jumpTo(line: number) {
    setTab("file");
    // The editor may be showing the test file: wait for it to switch back before moving.
    requestAnimationFrame(() => {
      const view = editor.current?.view;
      if (!view) return;
      const pos = view.state.doc.line(Math.min(line, view.state.doc.lines)).from;
      view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      view.focus();
    });
  }
  const symbolLine = useMemo(() => findSymbolLine(code, task.about.whereToLook.symbol), [code, task.about.whereToLook.symbol]);

  async function run(kind: RunKind) {
    setRunError(null);
    markInProgress(task.slug);
    const ids = kind === "issue" ? task.failToPass : required;
    try {
      const result = await runner.run({ [task.file]: code, [task.testFile]: task.tests }, ids, kind, { offlineData: task.offlineData });
      setLastRun({ kind, result });
      if (kind === "check" && judgeCheck(required, result).solved) {
        markSolved(task.slug);
        setSolved(true);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = runner.state !== "ready";
  const result = lastRun?.result;
  const byId = useMemo(() => new Map((result?.results ?? []).map((r) => [r.id, r])), [result]);
  const plainError = result?.error ? explainRunError(result.error, task.file) : null;
  const verdict = lastRun?.kind === "check" && result ? judgeCheck(required, result) : null;
  const changed = code !== task.before;

  return (
    <div className="workspace">
      <section className="ws-side" aria-label="Task">
        <h1 className="ws-title">{task.about.title}</h1>
        <p className="muted ws-meta">
          scikit-learn · <a href={task.about.pr.url} target="_blank" rel="noreferrer">PR #{task.pr}</a> · you edit{" "}
          <code>{task.file}</code>
        </p>

        {solved && (
          <div className="solved-banner" role="status" data-testid="solved-banner">
            <strong>Solved.</strong> Checked in your browser: every required test passes.
          </div>
        )}

        <h2 className="ws-h">What this teaches</h2>
        <p>{task.about.teaches}</p>

        <h2 className="ws-h">The real issue</h2>
        <p>{task.about.summary}</p>
        {task.about.quotes.map((q) => (
          <blockquote key={q.text} className="quote">
            <p>{q.text}</p>
            <footer className="muted">
              From the{" "}
              <a href={q.url} target="_blank" rel="noreferrer">
                {q.source}
              </a>
            </footer>
          </blockquote>
        ))}
        {task.about.issue && (
          <p className="muted small">
            The fix&rsquo;s test refers to{" "}
            <a href={task.about.issue.url} target="_blank" rel="noreferrer">
              issue #{task.about.issue.number}
            </a>
            {task.about.issue.fetched ? "." : " (we couldn't fetch its text, so it isn't quoted here)."}
          </p>
        )}

        <h2 className="ws-h">Where to look</h2>
        <p>
          <code>{task.about.whereToLook.symbol}</code> in <code>{task.file}</code>. {task.about.whereToLook.hint}
        </p>
        {symbolLine && (
          <button type="button" onClick={() => jumpTo(symbolLine)}>
            Jump to it (line {symbolLine})
          </button>
        )}

        <h2 className="ws-h">The tests you must make pass</h2>
        {plainError && (
          <div className="run-error" role="alert" data-testid="run-error">
            <p>
              <strong>{plainError.headline}</strong>
            </p>
            {plainError.line && (
              <button type="button" className="link" onClick={() => jumpTo(plainError.line!)}>
                Go to line {plainError.line}
              </button>
            )}
            <details>
              <summary>Details from pytest</summary>
              <pre className="pre">{plainError.details}</pre>
            </details>
          </div>
        )}
        <ul className="tests">
          {task.failToPass.map((id) => (
            <TestRow key={id} id={id} r={plainError ? undefined : byId.get(id)} />
          ))}
        </ul>
        {task.offlineData.includes("raccoon_face") && (
          <p className="muted small" data-testid="offline-note">
            These tests use a stand-in image instead of SciPy&rsquo;s raccoon photo, so they can run offline in your browser.
          </p>
        )}
        <p className="muted small">
          &ldquo;Check my fix&rdquo; also runs the {task.passToPass.length} other tests in <code>{baseName(task.testFile)}</code> that must
          keep passing.
        </p>
        {verdict && !plainError && (
          <div className={verdict.solved ? "verdict good" : "verdict bad"} data-testid="verdict">
            {verdict.solved
              ? `All ${verdict.total} required tests pass.`
              : `${verdict.passed} of ${verdict.total} required tests pass.`}
            {verdict.failing.length > 0 && (
              <ul className="tests">
                {verdict.failing.slice(0, 20).map((r) => (
                  <TestRow key={r.id} id={r.id} r={r} />
                ))}
              </ul>
            )}
            {verdict.failing.length > 20 && <p className="small">… and {verdict.failing.length - 20} more.</p>}
            {verdict.missing.length > 0 && <p className="small">{verdict.missing.length} required tests didn&rsquo;t run.</p>}
          </div>
        )}

        {solved && (
          <>
            <h2 className="ws-h">The real fix</h2>
            <p>
              This is what scikit-learn&rsquo;s maintainers merged. Compare it with yours, then read{" "}
              <a href={task.about.pr.url} target="_blank" rel="noreferrer">
                the pull request
              </a>{" "}
              to see how they reviewed it.
            </p>
            <Diff text={task.fixDiff} />
          </>
        )}
      </section>

      <section className="ws-main" aria-label="Code">
        <div className="ws-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "file"} className={tab === "file" ? "on" : ""} onClick={() => setTab("file")}>
            ✎ {baseName(task.file)}
            {changed ? " •" : ""}
          </button>
          <button type="button" role="tab" aria-selected={tab === "tests"} className={tab === "tests" ? "on" : ""} onClick={() => setTab("tests")}>
            {baseName(task.testFile)}
          </button>
        </div>
        <div className="ws-file-bar">
          <span className="ws-path">{tab === "file" ? task.file : task.testFile}</span>
          {tab === "file" ? (
            changed && (
              <button type="button" className="link" onClick={reset}>
                Reset to the original code
              </button>
            )
          ) : (
            <span className="pill">read-only</span>
          )}
        </div>
        <div className="ws-editor">
          <CodeMirror
            key={tab}
            ref={tab === "file" ? editor : undefined}
            value={tab === "file" ? code : task.tests}
            onChange={tab === "file" ? onEdit : undefined}
            extensions={[python()]}
            editable={tab === "file"}
            readOnly={tab !== "file"}
            theme={dark ? "dark" : "light"}
            height="100%"
            style={{ height: "100%" }}
            aria-label={tab === "file" ? `Your code: ${task.file}` : `Tests (read-only): ${task.testFile}`}
          />
        </div>
        <div className="ws-bar">
          <span className="muted small ws-status" aria-live="polite" data-testid="runner-status">
            {runner.state === "loading" && LOADING[runner.stage]}
            {runner.state === "running" && "Running the tests…"}
            {runner.state === "failed" && `Python couldn't start: ${runner.bootError}`}
            {runner.state === "ready" && !result && "Ready."}
            {runner.state === "ready" && result && `Last run took ${(result.durationMs / 1000).toFixed(1)} s.`}
          </span>
          {runError && (
            <span className="error small" role="alert">
              {runError}
            </span>
          )}
          <span className="ws-buttons">
            <button type="button" onClick={() => void run("issue")} disabled={busy}>
              Run the issue&rsquo;s tests
            </button>
            <button type="button" className="primary" onClick={() => void run("check")} disabled={busy}>
              Check my fix
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}

function TestRow({ id, r }: { id: string; r: TestResult | undefined }) {
  const outcome = r?.outcome;
  const icon = outcome === "passed" ? "✓" : outcome === "failed" ? "✗" : outcome === "skipped" ? "–" : "○";
  return (
    <li className={`test ${outcome ?? "not-run"}`} data-testid="test-row">
      <span className="test-icon" aria-label={outcome ?? "not run yet"}>
        {icon}
      </span>
      <span className="test-body">
        <code title={id}>{shortName(id)}</code>
        {r?.message && <pre className="pre">{r.message}</pre>}
      </span>
    </li>
  );
}

function Diff({ text }: { text: string }) {
  return (
    <pre className="pre diff" data-testid="fix-diff">
      {text.split("\n").map((l, i) => (
        <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : undefined}>
          {l}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}
