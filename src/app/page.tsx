import Link from "next/link";
import { DashboardCalendar } from "@/components/dashboard-calendar";
import { calendarDeadlines } from "@/lib/dashboard-calendar";
import { TrackerHeader } from "@/components/tracker-header";
import { taskUrgency } from "@/lib/task-urgency";
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
  const overdue = queue.filter(item => item.section === "Overdue").length;
  const dueToday = queue.filter(item => item.date === today).length;
  const weekAhead = queue.filter(item => item.date && item.date > today).length;
  return <div className="min-h-svh">
    <TrackerHeader active="dashboard" />
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="tracker-eyebrow mb-3">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now)}</p>
          <h1 className="text-4xl font-semibold tracking-tight">Your next steps</h1>
          <p className="mt-3 text-muted-foreground">Your recruiting work, in order of what needs attention.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link className="tracker-button" href="/opportunities">View opportunities</Link><Link className="tracker-button tracker-primary" href="/tasks?new=1">Add task</Link></div>
      </header>

      <dl className="tracker-panel grid grid-cols-3 divide-x p-2 sm:p-3" aria-label="Work ahead">
        {([["Overdue", overdue], ["Due today", dueToday], ["Next seven days", weekAhead]] as const).map(([label, count]) => <div className="px-3 py-3 sm:px-5" key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt><dd className={`mt-1 text-3xl font-semibold tabular-nums ${label === "Overdue" && count ? "text-destructive" : ""}`}>{count}</dd>
        </div>)}
      </dl>

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="queue-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="queue-heading" className="text-xl font-semibold tracking-tight">Action queue</h2><Link className="text-sm text-primary underline-offset-4 hover:underline" href="/tasks">All tasks</Link></div>
          {queue.length ? <div className="tracker-panel overflow-hidden">{queueSections.map(section => {
            const items = queue.filter(item => item.section === section);
            return items.length ? <div key={section}>
              <h3 className={`flex items-center justify-between border-y bg-muted/40 px-5 py-3 text-sm font-semibold ${section === "Overdue" ? "text-destructive" : ""}`}><span>{section}</span><span className="tabular-nums">{items.length}</span></h3>
              <ul className="divide-y">{items.map(item => <li key={`${item.kind}:${item.id}`} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${item.kind === "task" ? `task-glass task-urgency task-urgency-${taskUrgency(item.date, false, today).tone}` : ""}`}>
                <div className="min-w-0 flex-1 basis-48"><Link className="break-words font-medium underline-offset-4 hover:underline" href={item.href}>{item.title}</Link>
                  <p className="mt-1 text-sm text-muted-foreground">{item.context}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className={section === "Overdue" ? "text-destructive" : "text-muted-foreground"}>{item.date ? displayDate(item.date) : "Ready when you are"}</span>{item.kind === "task" && <span className="task-urgency-label text-xs font-medium">{taskUrgency(item.date, false, today).label}</span>}{item.priority === "high" && <span className="tracker-badge">High priority</span>}</div>
                </div><QueueControls item={item} />
              </li>)}</ul>
            </div> : null;
          })}</div> : <div className="tracker-panel space-y-3 p-8"><h3 className="font-semibold">You’re caught up</h3><p className="text-sm text-muted-foreground">Add a task, plan a next action, or mark an opportunity ready for outreach.</p><Link className="tracker-button" href="/opportunities">View opportunities</Link></div>}
          <p className="text-xs leading-relaxed text-muted-foreground">America/New_York · Dated work covers today and the next seven days, plus overdue items.</p>
        </section>

        <aside className="min-w-0 space-y-7"><DashboardCalendar today={today} deadlines={calendarDeadlines(data.tasks, activeGoals, data.opportunities, data.activities)} />
        <section className="min-w-0 space-y-4" aria-labelledby="goals-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="goals-heading" className="text-xl font-semibold tracking-tight">Goal progress</h2><Link className="text-sm text-primary underline-offset-4 hover:underline" href="/goals">Manage goals</Link></div>
          {activeGoals.length ? <div className="tracker-panel divide-y overflow-hidden">{activeGoals.map(goal => <Link key={goal.id} href={`/goals?goal=${goal.id}#goal-${goal.id}`} className="block space-y-3 p-5 transition-colors hover:bg-muted/40">
            <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-medium">{goal.title}</span><span className="shrink-0 text-sm tabular-nums text-primary">{goal.current} / {goal.target_count}</span></div>
            <div className="h-1.5 overflow-hidden rounded-none bg-muted" role="progressbar" aria-label={goal.title} aria-valuemin={0} aria-valuemax={goal.target_count} aria-valuenow={Math.min(goal.current, goal.target_count)}><div className="h-full rounded-none bg-primary" style={{ width: `${goal.percentage}%` }} /></div>
            <p className="text-sm text-muted-foreground">{goal.completed ? "Completed" : `Due ${displayDate(goal.end_date)}`}</p>
          </Link>)}</div> : <div className="tracker-panel space-y-3 p-5"><p className="text-sm text-muted-foreground">Set a weekly or long-term target to see your progress here.</p><Link className="tracker-button" href="/goals">Create a goal</Link></div>}
        </section></aside>
      </div>

      <section className="space-y-4" aria-labelledby="totals-heading">
        <div><h2 id="totals-heading" className="text-xl font-semibold tracking-tight">Recruiting totals</h2><p className="mt-1 text-sm text-muted-foreground">Distinct opportunities reached across your saved activity.</p></div>
        <dl className="tracker-panel grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6">{([["Research contacts", "research_contacts"], ["Startup contacts", "startup_contacts"], ["Applications", "formal_applications"], ["Positive responses", "positive_responses"], ["Meetings / interviews", "meetings_completed"], ["Offers received", "offers_received"]] as [string, Metric][]).map(([label, metric]) => <div key={label} className="border-b border-r p-5"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{metricProgress(metric, data, "1970-01-01", today, now)}</dd></div>)}</dl>
      </section>

      <section className="space-y-4" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="text-xl font-semibold tracking-tight">Recent activity</h2>
        <div className="tracker-panel overflow-hidden">{recent.length ? <ol className="divide-y">{recent.map(item => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
          <Link href={item.href} className="min-w-0 break-words underline-offset-4 hover:underline"><span className="font-medium">{item.title}</span><span className="ml-2 text-sm text-muted-foreground">{item.context}</span></Link><time className="text-sm text-muted-foreground" dateTime={item.time}>{displayActivityTime(item.time)}</time>
        </li>)}</ol> : <p className="p-5 text-sm text-muted-foreground">Your logged activities and completed tasks will appear here.</p>}</div>
      </section>
    </main>
  </div>;
}
