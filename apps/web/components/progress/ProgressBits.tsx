"use client";

import { solvedCount, statusOf, type TaskStatus } from "../../lib/progress";
import { useProgress } from "./useProgress";

const LABEL: Record<TaskStatus, string> = { "not-started": "Not started", "in-progress": "In progress", solved: "Solved" };

/** "2 of 5 solved", from this browser's progress. */
export function SolvedCount({ slugs }: { slugs: string[] }) {
  const progress = useProgress();
  if (!progress) return <span className="muted">&nbsp;</span>;
  return (
    <span data-testid="solved-count">
      {solvedCount(progress, slugs)} of {slugs.length} solved
    </span>
  );
}

/** A task's status on the path. */
export function TaskStatusBadge({ slug }: { slug: string }) {
  const progress = useProgress();
  const status = progress ? statusOf(progress, slug) : null;
  return (
    <span className={`status ${status ?? "unknown"}`} data-testid={`status-${slug}`}>
      {status ? LABEL[status] : " "}
    </span>
  );
}
