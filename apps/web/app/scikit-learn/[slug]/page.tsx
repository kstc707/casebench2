import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { TaskWorkspace } from "../../../components/task/TaskWorkspace";
import { getTask, listTasks } from "../../../lib/tasks";

// One static page per task, built from content/scikit-learn; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return listTasks().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const task = getTask((await params).slug);
  return { title: task ? `${task.title} · scikit-learn · Casebench 2` : "scikit-learn · Casebench 2" };
}

/** A task: the real issue and its context, the student's file, and scikit-learn's own tests, run in the browser. */
export default async function TaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const task = getTask((await params).slug);
  if (!task) notFound();
  return (
    <>
      <SiteHeader
        crumbs={
          <>
            <Link href="/scikit-learn">scikit-learn</Link> / <strong>{task.title}</strong>
          </>
        }
      />
      <TaskWorkspace task={task} />
    </>
  );
}
