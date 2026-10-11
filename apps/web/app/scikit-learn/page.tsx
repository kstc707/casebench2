import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SolvedCount, TaskStatusBadge } from "../../components/progress/ProgressBits";
import { listTasks } from "../../lib/tasks";

export const metadata = { title: "scikit-learn · Casebench 2" };

/** The scikit-learn path: the tasks in a suggested order, smallest real fix first. */
export default function ScikitLearnPath() {
  const tasks = listTasks();
  return (
    <>
      <SiteHeader crumbs={<strong>scikit-learn</strong>} />
      <main className="page">
        <h1>scikit-learn: fix real bugs from the project&rsquo;s history</h1>
        <p className="lead">
          Each task is a bug that scikit-learn&rsquo;s maintainers really fixed. You get the code as it shipped in
          scikit-learn 1.8.0, before the fix, and the project&rsquo;s own tests from the fix. Make them pass.
        </p>
        <p>
          <SolvedCount slugs={tasks.map((t) => t.slug)} />
          <span className="muted"> · Suggested order: smallest fix first.</span>
        </p>
        <ol className="task-list">
          {tasks.map((t, i) => (
            <li key={t.slug} className="task-row">
              <span className="task-num" aria-hidden>
                {i + 1}
              </span>
              <div className="task-main">
                <Link href={`/scikit-learn/${t.slug}`} className="task-title">
                  {t.title}
                </Link>
                <div className="muted task-meta">
                  {t.teaches} · <code>{t.file}</code> · PR #{t.pr}
                </div>
              </div>
              <TaskStatusBadge slug={t.slug} />
            </li>
          ))}
        </ol>
        <p className="muted note">
          Your progress and drafts are saved in this browser only. Clearing your browser data, or using another
          browser or device, starts you afresh.
        </p>
      </main>
    </>
  );
}
