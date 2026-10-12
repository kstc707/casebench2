"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Passage } from "@casebench2/team-memory/src/corpus";
import { changelogChecks, codeChecks, fragmentPath, prBody, prChecks, PR_SECTIONS, unifiedDiff, type CheckResult, type PrForm } from "../../lib/coach/checks";
import { indexRules, retrieveRules, REVIEW_QUERIES } from "../../lib/coach/retrieval";
import { buildClaudeRequest as buildReviewRequest, CLAUDE_KEY_FORMAT as API_KEY_FORMAT, CLAUDE_MODEL as MODEL, claudeClient as browserClient, runClaudeReview as runReview } from "../../lib/coach/claude";
import { describeViolation, redactKey, reviewContext, type CoachLogEntry, type ReviewOutcome } from "../../lib/coach/review";
import { coachLogJson, readApiKey, readCoachState, writeApiKey, writeCoachState, type CoachState } from "../../lib/coach/storage";
import type { TaskDetail } from "../../lib/tasks";

type Stage = "checks" | "pr" | "explain" | "review";
const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "checks", label: "1. Checks" },
  { id: "pr", label: "2. Write your PR" },
  { id: "explain", label: "3. Explain" },
  { id: "review", label: "4. AI review" },
];

/**
 * "Prepare your pull request": shown once the task is solved. Stages 1–3 work without any AI; stage 4
 * sends one review request to the Anthropic API with the student's own key.
 */
export function CoachPanel({ task, code, solved, rulePassages }: { task: TaskDetail; code: string; solved: boolean; rulePassages: Passage[] }) {
  const [stage, setStage] = useState<Stage>("checks");
  const [state, setState] = useState<CoachState | null>(null);
  const [saveProblem, setSaveProblem] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => setState(readCoachState(task.slug)), [task.slug]);

  function update(change: (s: CoachState) => CoachState) {
    setState((s) => {
      if (!s) return s;
      const next = change(s);
      setSaveProblem(!writeCoachState(task.slug, next));
      return next;
    });
  }

  const code1 = useMemo(
    () => codeChecks({ file: task.file, before: task.before, code, symbol: task.about.whereToLook.symbol, fixSize: task.fixSize, solved }),
    [task, code, solved]
  );
  const pr2 = useMemo(() => (state ? prChecks(state.pr) : []), [state]);
  const log2 = useMemo(() => (state ? changelogChecks(state.changelog, task.coach.changelog.mentions) : []), [state, task.coach.changelog.mentions]);

  if (!state) return null;

  return (
    <section className="coach" aria-labelledby="coach-title" data-testid="coach">
      <h2 className="ws-h" id="coach-title">
        Prepare your pull request
      </h2>
      <p className="small">
        Before a maintainer spends time on a pull request, it should follow the project&rsquo;s rules, be written the way
        scikit-learn asks, and you must be able to explain every change. Stages 1&ndash;3 need no AI.
      </p>
      <div className="coach-tabs" role="tablist" aria-label="Stages">
        {STAGES.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={stage === s.id} className={stage === s.id ? "on" : ""} onClick={() => setStage(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {saveProblem && <p className="error small">Couldn&rsquo;t save in this browser: your work here will be lost when you leave.</p>}
      <span className="visually-hidden" aria-live="polite" data-testid="coach-announcement">
        {announcement}
      </span>

      {stage === "checks" && (
        <div role="tabpanel" aria-label="Checks">
          <p className="small">Automatic checks of your change, each with the scikit-learn rule it comes from.</p>
          <Checks results={code1} />
        </div>
      )}

      {stage === "pr" && (
        <div role="tabpanel" aria-label="Write your PR">
          <p className="small">scikit-learn&rsquo;s pull request template has these sections. Write each in your own words.</p>
          {PR_SECTIONS.map((sec) => (
            <Field key={sec.key} label={sec.heading}>
              {(id) => (
                <textarea
                  id={id}
                  rows={sec.key === "what" ? 5 : 2}
                  value={state.pr[sec.key]}
                  onChange={(e) => update((s) => ({ ...s, pr: { ...s.pr, [sec.key]: e.target.value } as PrForm }))}
                />
              )}
            </Field>
          ))}
          <Checks results={pr2} />
          <h3 className="coach-h">Changelog fragment</h3>
          <p className="small">
            Save it as <code data-testid="fragment-path">{fragmentPath(task.coach.changelog.folder, task.coach.changelog.type)}</code> (the real fix was{" "}
            <code>
              {task.coach.changelog.folder}/{task.pr}.{task.coach.changelog.type}.rst
            </code>
            ).
          </p>
          <Field label="Fragment (reStructuredText)">
            {(id) => (
              <textarea
                id={id}
                rows={4}
                value={state.changelog}
                placeholder={"- :func:`module.function` now …\n  By :user:`Your Name <your-github-handle>`."}
                onChange={(e) => update((s) => ({ ...s, changelog: e.target.value }))}
              />
            )}
          </Field>
          <Checks results={log2} />
        </div>
      )}

      {stage === "explain" && (
        <div role="tabpanel" aria-label="Explain your change">
          <p className="small">
            scikit-learn asks contributors to understand and be able to explain every change. Answer in your own words, then
            compare with the key points.
          </p>
          {task.coach.questions.map((q) => (
            <Question
              key={q.id}
              question={q}
              answer={state.answers[q.id] ?? ""}
              ticks={state.ticks[q.id] ?? []}
              onAnswer={(text) => update((s) => ({ ...s, answers: { ...s.answers, [q.id]: text } }))}
              onTicks={(ids) => update((s) => ({ ...s, ticks: { ...s.ticks, [q.id]: ids } }))}
            />
          ))}
        </div>
      )}

      {stage === "review" && (
        <AiReview
          task={task}
          state={state}
          checks={[...code1, ...pr2, ...log2]}
          diff={unifiedDiff(task.file, task.before, code)}
          rulePassages={rulePassages}
          onLog={(entry) => update((s) => ({ ...s, log: [...s.log, entry] }))}
          onRate={(index, comment, rating) =>
            update((s) => ({
              ...s,
              log: s.log.map((e, i) => (i === index ? { ...e, ratings: { ...e.ratings, [comment]: rating } } : e)),
            }))
          }
          announce={setAnnouncement}
        />
      )}
    </section>
  );
}

/** A label above its control, linked by id (a wrapping label would fold the typed text into the control's name). */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

function Checks({ results }: { results: CheckResult[] }) {
  return (
    <ul className="checks">
      {results.map((r) => (
        <li key={r.id} className={r.ok ? "check ok" : "check bad"} data-testid={`check-${r.id}`}>
          <span className="test-icon" aria-hidden="true">
            {r.ok ? "✓" : "✗"}
          </span>
          <span className="test-body">
            <span className="visually-hidden">{r.ok ? "Passed: " : "Needs work: "}</span>
            <strong>{r.title}</strong>. {r.detail}
            <span className="rule muted">
              From scikit-learn&rsquo;s <code>{r.rule.file.replace("contributing/", "")}</code>: &ldquo;{r.rule.quote}&rdquo;
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Question({
  question,
  answer,
  ticks,
  onAnswer,
  onTicks,
}: {
  question: TaskDetail["coach"]["questions"][number];
  answer: string;
  ticks: string[];
  onAnswer: (text: string) => void;
  onTicks: (ids: string[]) => void;
}) {
  const [shown, setShown] = useState(ticks.length > 0);
  return (
    <div className="question" data-testid={`question-${question.id}`}>
      <Field label={question.prompt}>{(id) => <textarea id={id} rows={3} value={answer} onChange={(e) => onAnswer(e.target.value)} />}</Field>
      {!shown ? (
        <button type="button" onClick={() => setShown(true)} disabled={answer.trim().length < 10}>
          Compare with the key points
        </button>
      ) : (
        <fieldset className="points">
          <legend className="small">Tick the key points your answer covers:</legend>
          {question.points.map((p) => (
            <label key={p.id} className="point">
              <input
                type="checkbox"
                checked={ticks.includes(p.id)}
                onChange={(e) => onTicks(e.target.checked ? [...ticks, p.id] : ticks.filter((t) => t !== p.id))}
              />{" "}
              {p.text}
              {p.inferred && <span className="muted"> (our inference from the code, not stated in the sources)</span>}
            </label>
          ))}
          <p className="small muted">
            {ticks.length} of {question.points.length} covered.
          </p>
        </fieldset>
      )}
    </div>
  );
}

function AiReview({
  task,
  state,
  checks,
  diff,
  rulePassages,
  onLog,
  onRate,
  announce,
}: {
  task: TaskDetail;
  state: CoachState;
  checks: CheckResult[];
  diff: string;
  rulePassages: Passage[];
  onLog: (entry: CoachLogEntry) => void;
  onRate: (logIndex: number, comment: string, rating: "up" | "down") => void;
  announce: (text: string) => void;
}) {
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const index = useMemo(() => indexRules(rulePassages), [rulePassages]);
  useEffect(() => {
    const k = readApiKey();
    setKey(k);
    setSavedKey(k !== "");
  }, []);

  const latest = state.log.length ? state.log[state.log.length - 1] : null;
  const latestIndex = state.log.length - 1;

  const [keyProblem, setKeyProblem] = useState<string | null>(null);

  async function review() {
    const apiKey = key.trim();
    if (!API_KEY_FORMAT.test(apiKey)) {
      setKeyProblem("That doesn't look like an Anthropic API key (they start with sk-ant-). Nothing was sent.");
      announce("That doesn't look like an Anthropic API key. Nothing was sent.");
      return;
    }
    setKeyProblem(null);
    setBusy(true);
    announce("Reviewing…");
    const failing = checks.filter((c) => !c.ok).map((c) => c.title);
    const rules = retrieveRules(index, [...REVIEW_QUERIES, ...failing]);
    const input = {
      task: { slug: task.slug, title: task.title, pr: task.pr, file: task.file, testFile: task.testFile },
      diff,
      prBody: prBody(state.pr),
      changelog: { path: fragmentPath(task.coach.changelog.folder, task.coach.changelog.type), text: state.changelog },
      answers: task.coach.questions.map((q) => ({ questionId: q.id, prompt: q.prompt, answer: state.answers[q.id] ?? "", points: q.points.map((p) => ({ id: p.id, text: p.text })) })),
      checks,
      rules,
    };
    const request = buildReviewRequest(input);
    // The key is removed from anything the API echoes back before it is shown or logged.
    const outcome = redactKey(await runReview(browserClient(apiKey) as never, request, reviewContext(input)), apiKey);
    onLog({
      at: new Date().toISOString(),
      slug: task.slug,
      provider: "claude",
      model: outcome.model ?? MODEL,
      request,
      rules,
      outcome,
      ratings: {},
      selfCheck: Object.fromEntries(Object.entries(state.ticks).map(([q, ids]) => [q, [...ids]])),
    });
    announce(outcome.ok ? `Review ready: ${outcome.review.verdict}.` : outcome.message);
    setBusy(false);
  }

  function download() {
    const blob = new Blob([coachLogJson(task.slug, state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `coach-log-${task.slug}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div role="tabpanel" aria-label="AI review">
      <p className="small">
        Optional. One request reviews your change, PR text, changelog and answers against scikit-learn&rsquo;s rules, using{" "}
        <strong>your own Anthropic API key</strong>. It costs you a few cents per review; the estimate is shown after each one.
      </p>
      <div className="key-note small" data-testid="key-note">
        <p>
          <strong>Where your key goes.</strong> If you save it, it is kept in this browser&rsquo;s localStorage, on this device
          only. It is sent only to <code>api.anthropic.com</code>, never to Casebench. Any script running on this page could
          read it, so use a key with a low spending limit, and remove it when you&rsquo;re done.
        </p>
      </div>
      <Field label="Anthropic API key">
        {(id) => <input id={id} type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />}
      </Field>
      <div className="row">
        <button type="button" onClick={() => setSavedKey(writeApiKey(key.trim()) && key.trim() !== "")} disabled={key.trim() === ""}>
          Save key in this browser
        </button>
        {savedKey && (
          <button
            type="button"
            className="link"
            onClick={() => {
              writeApiKey("");
              setKey("");
              setSavedKey(false);
            }}
          >
            Remove saved key
          </button>
        )}
        <button type="button" className="primary" onClick={() => void review()} disabled={busy || key.trim() === ""}>
          {busy ? "Reviewing…" : "Review my pull request"}
        </button>
      </div>
      {keyProblem && (
        <p className="error small" role="alert" data-testid="key-problem">
          {keyProblem}
        </p>
      )}

      {latest && <ReviewResult entry={latest} task={task} onRate={(comment, rating) => onRate(latestIndex, comment, rating)} />}

      {state.log.length > 0 && (
        <p className="small">
          <button type="button" className="link" onClick={download}>
            Download coach log (JSON)
          </button>{" "}
          <span className="muted">
            {state.log.length} review{state.log.length === 1 ? "" : "s"}, with inputs, outputs, tokens, time and your ratings.
          </span>
        </p>
      )}
    </div>
  );
}

function usageLine(model: string, usage: { input_tokens: number; output_tokens: number }, cost: number | null, latencyMs: number): string {
  const tokens = `${usage.input_tokens.toLocaleString("en")} input + ${usage.output_tokens.toLocaleString("en")} output tokens`;
  const price = cost === null ? "price unknown for this model" : `about $${cost.toFixed(3)} (estimate)`;
  return `${tokens} · ${price} · ${(latencyMs / 1000).toFixed(1)} s · ${model}`;
}

function ReviewResult({ entry, task, onRate }: { entry: CoachLogEntry; task: TaskDetail; onRate: (comment: string, rating: "up" | "down") => void }) {
  const o: ReviewOutcome = entry.outcome;
  if (!o.ok) {
    return (
      <div className="run-error" role="alert" data-testid="review-error">
        <p>
          <strong>{o.message}</strong>
        </p>
        {o.usage && (
          <p className="small" data-testid="review-usage">
            {usageLine(o.model ?? MODEL, o.usage, o.costUsd ?? null, o.latencyMs)}
          </p>
        )}
      </div>
    );
  }
  const rules = new Map((entry.rules ?? []).map((r) => [r.id, `${r.file.replace("contributing/", "")}${r.heading ? ` (${r.heading})` : ""}: ${r.text.replace(/\s+/g, " ").trim()}`]));
  const questions = new Map(task.coach.questions.map((q) => [q.id, q]));
  return (
    <div className="review" data-testid="review-result">
      <p className={o.review.verdict === "ready" ? "verdict good" : "verdict bad"} data-testid="review-verdict">
        <strong>{o.review.verdict === "ready" ? "Ready to open." : "Needs work."}</strong> {o.review.reasons.join(" ")}
      </p>
      <h3 className="coach-h">Comments</h3>
      <ul className="comments">
        {o.review.comments.map((c, i) => (
          <li key={i} className={`comment ${c.severity}`} data-testid="review-comment">
            <span className="pill">{c.severity}</span> <span className="muted small">{c.where}{c.line ? `, line ${c.line}` : ""}</span>
            <p>{c.comment}</p>
            {c.rule && rules.has(c.rule) && <p className="rule muted small">Rule {c.rule}: {rules.get(c.rule)}</p>}
            {c.rule && !rules.has(c.rule) && (
              <p className="error small" data-testid="invented-rule">
                Cites a rule that wasn&rsquo;t provided ({c.rule}): treat this comment with care.
              </p>
            )}
            <span className="rate" role="group" aria-label="Was this comment useful?">
              <button type="button" aria-pressed={entry.ratings[String(i)] === "up"} onClick={() => onRate(String(i), "up")}>
                👍<span className="visually-hidden"> Useful</span>
              </button>
              <button type="button" aria-pressed={entry.ratings[String(i)] === "down"} onClick={() => onRate(String(i), "down")}>
                👎<span className="visually-hidden"> Not useful</span>
              </button>
            </span>
          </li>
        ))}
      </ul>
      <h3 className="coach-h">Your answers</h3>
      {o.review.answers.map((a) => {
        const q = questions.get(a.questionId);
        const text = (id: string) => q?.points.find((p) => p.id === id)?.text ?? id;
        return (
          <div key={a.questionId} className="answer-review" data-testid="answer-review">
            <p className="small">
              <strong>{q?.prompt ?? a.questionId}</strong>
            </p>
            {a.covered.length > 0 && <p className="small">Covered: {a.covered.map(text).join(" · ")}</p>}
            {a.missed.length > 0 && <p className="small">Missed: {a.missed.map(text).join(" · ")}</p>}
            <p className="small">
              <em>Follow-up:</em> {a.followUp}
            </p>
          </div>
        );
      })}
      {o.violations.length > 0 && (
        <div className="small violations" data-testid="review-violations">
          <p>
            <strong>This review broke {o.violations.length === 1 ? "one of its own rules" : `${o.violations.length} of its own rules`}:</strong>
          </p>
          <ul>
            {o.violations.map((v, i) => (
              <li key={i}>{describeViolation(v)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="small muted" data-testid="review-usage">
        {usageLine(o.model, o.usage, o.costUsd, o.latencyMs)}
        {o.fallbacks === "off" ? " · refusal fallbacks unavailable for this request" : ""}
      </p>
    </div>
  );
}

