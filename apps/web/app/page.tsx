import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { SolvedCount } from "../components/progress/ProgressBits";
import { listTasks } from "../lib/tasks";

export default function Home() {
  const tasks = listTasks();
  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1>Casebench 2</h1>
        <p className="lead">
          Learn how real open-source projects work, from your first fork to your first merged pull request.
        </p>
        <Link href="/scikit-learn" className="card card-link">
          <h2>scikit-learn: fix real bugs from the project&rsquo;s history</h2>
          <p className="muted">
            {tasks.length} real, already-merged fixes. Edit the code and run scikit-learn&rsquo;s own tests in your browser.
          </p>
          <p className="card-foot">
            <SolvedCount slugs={tasks.map((t) => t.slug)} />
          </p>
        </Link>
      </main>
    </>
  );
}
