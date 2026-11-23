import Link from "next/link";
import { TrackerHeader } from "@/components/tracker-header";
import { QueueControls } from "@/components/queue-controls";
import { withOpportunities } from "@/lib/opportunities";
import { buildActionQueue, queueSections, todayInNewYork } from "@/lib/action-queue";
import { displayDate } from "@/lib/opportunity-model";
import { displayActivityTime } from "@/lib/activity-model";
import { goalWithProgress, metricProgress, type Metric } from "@/lib/goal-model";

export const dynamic = "force-dynamic";

export default function Home() {
  const now = new Date();
  const today = todayInNewYork(now);
  const data = withOpportunities(store => ({ opportunities: store.list(), tasks: store.tasks(), activities: store.allActivities(), goals: store.goals() }));
  const activeGoals = data.goals.filter(goal => goal.status === "active").map(goal => goalWithProgress(goal, data, now));
  const queue = buildActionQueue(data.opportunities, data.tasks, data.activities, today);
  const names = new Map(data.opportunities.map(item => [item.id, item.organization_name]));
  const recent = [
    ...data.activities.map(activity => ({ id: activity.id, title: activity.activity_type, context: names.get(activity.opportunity_id) ?? "Opportunity", time: activity.occurred_at, href: `/opportunities?opportunity=${encodeURIComponent(activity.opportunity_id)}` })),
    ...data.tasks.filter(task => task.completed_at).map(task => ({ id: task.id, title: "Task completed", context: task.title, time: task.completed_at!, href: `/tasks?task=${task.id}#task-${task.id}` })),
  ].sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id)).slice(0, 10);
  return <div className="min-h-svh bg-muted/25"><TrackerHeader active="dashboard" /><main className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now)}</p><h1 className="text-3xl font-semibold tracking-tight">Your next steps</h1><p className="mt-2 text-muted-foreground">Overdue work and the week ahead, all in one place.</p></div><Link className="tracker-button tracker-primary" href="/tasks?new=1">Add task</Link></div>
    <dl className="grid gap-4 sm:grid-cols-3">{([ ["Research contacts reached", "research_contacts"], ["Startup contacts reached", "startup_contacts"], ["Formal applications submitted", "formal_applications"], ["Positive responses", "positive_responses"], ["Completed meetings / interviews", "meetings_completed"], ["Offers received", "offers_received"] ] as [string, Metric][]).map(([label, metric]) => <div key={label} className="tracker-panel p-5"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{metricProgress(metric, data, "1970-01-01", today, now)}</dd></div>)}</dl>
    <section aria-labelledby="queue-heading" className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="queue-heading" className="text-xl font-semibold">Action queue</h2><p className="mt-1 text-sm text-muted-foreground">Dates use America/New_York. Upcoming items cover today through the next seven days.</p></div><Link className="text-sm underline underline-offset-4" href="/tasks">View all tasks</Link></div>
      {queue.length ? queueSections.map(section => {
        const items = queue.filter(item => item.section === section);
        return items.length ? <div className="tracker-panel overflow-hidden" key={section}><h3 className={`border-b px-5 py-4 text-sm font-semibold ${section === "Overdue" ? "text-destructive" : ""}`}>{section} · {items.length}</h3><ul className="divide-y">{items.map(item => <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><Link className="break-words font-medium underline-offset-4 hover:underline" href={item.href}>{item.title}</Link><div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{item.context}</span>{item.date && <span>{displayDate(item.date)}</span>}<span className="capitalize">{item.priority} priority</span></div></div><QueueControls item={item} /></li>)}</ul></div> : null;
      }) : <div className="tracker-panel space-y-3 p-8 text-center"><h3 className="font-semibold">Nothing waiting in your queue</h3><p className="text-sm text-muted-foreground">Add a task, plan a next action, or mark an opportunity ready for outreach.</p><Link className="tracker-button" href="/opportunities">View opportunities</Link></div>}
    </section>
    <section className="space-y-4" aria-labelledby="goals-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="goals-heading" className="text-xl font-semibold">Goal progress</h2><Link className="text-sm underline underline-offset-4" href="/goals">Manage goals</Link></div>{activeGoals.length ? <div className="grid gap-4 sm:grid-cols-2">{activeGoals.map(goal => <Link key={goal.id} href={`/goals?goal=${goal.id}#goal-${goal.id}`} className="tracker-panel space-y-3 p-5"><div className="flex justify-between gap-3"><span className="font-medium">{goal.title}</span><span className="text-sm tabular-nums">{goal.current} / {goal.target_count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={goal.title} aria-valuemin={0} aria-valuemax={goal.target_count} aria-valuenow={Math.min(goal.current, goal.target_count)}><div className="h-full bg-primary" style={{ width: `${goal.percentage}%` }} /></div><p className="text-sm text-muted-foreground">{goal.completed ? "Completed" : `Due ${displayDate(goal.end_date)}`}</p></Link>)}</div> : <p className="tracker-panel p-5 text-sm text-muted-foreground">Add a goal to track weekly or cumulative progress.</p>}</section>
    <section className="tracker-panel overflow-hidden" aria-labelledby="recent-heading"><h2 id="recent-heading" className="border-b px-5 py-4 font-semibold">Recent activity</h2>{recent.length ? <ol className="divide-y">{recent.map(item => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-3 p-5"><Link href={item.href} className="min-w-0 break-words underline-offset-4 hover:underline"><span className="font-medium">{item.title}</span><span className="ml-2 text-sm text-muted-foreground">{item.context}</span></Link><time className="text-sm text-muted-foreground" dateTime={item.time}>{displayActivityTime(item.time)}</time></li>)}</ol> : <p className="p-5 text-sm text-muted-foreground">Logged activities and completed tasks will appear here.</p>}</section>
  </main></div>;
}
