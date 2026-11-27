"use client";

import Link from "next/link";
import { useState } from "react";
import { TrackerHeader } from "@/components/tracker-header";
import { taskUrgency } from "@/lib/task-urgency";
import { addCalendarDays } from "@/lib/action-queue";
import { displayDate } from "@/lib/opportunity-model";
import type { AdmissionsData } from "@/lib/admissions-model";
import type { Task } from "@/lib/task-model";
import type { GoalView } from "@/lib/goal-model";
import { calendarDistance, clipTimelineSpan, shiftTimeline, timelineRows, timelineWindow, validCalendarDate, type TimelineScale } from "@/lib/timeline-model";

const rowLabels = { task: "Task", goal: "Goal", supplement: "Supplement" };

export function Timeline({ tasks, goals, today, admissions }: { tasks: Task[]; goals: GoalView[]; today: string; admissions: AdmissionsData }) {
  const [anchor, setAnchor] = useState(today);
  const [scale, setScale] = useState<TimelineScale>("weeks");
  const window = timelineWindow(anchor, scale);
  const totalDays = calendarDistance(window.start, window.end);
  const dayWidth = scale === "days" ? 44 : scale === "weeks" ? 22 : 6;
  const labelWidth = 224;
  const width = totalDays * dayWidth;
  const all = timelineRows(tasks, goals, admissions);
  const rows = all.rows.map(row => ({ row, span: clipTimelineSpan(row, window) })).filter(item => item.span !== null);
  const ticks: { start: number; days: number; label: string }[] = [];
  if (scale === "months") {
    for (let index = 0; index < 6; index++) {
      const date = new Date(`${window.start}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + index);
      const start = date.toISOString().slice(0, 10); date.setUTCMonth(date.getUTCMonth() + 1);
      ticks.push({ start: calendarDistance(window.start, start), days: calendarDistance(start, date.toISOString().slice(0, 10)), label: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T12:00:00Z`)) });
    }
  } else {
    const step = scale === "days" ? 1 : 7;
    for (let index = 0; index < totalDays; index += step) {
      const date = new Date(`${addCalendarDays(window.start, index)}T12:00:00Z`);
      ticks.push({ start: index, days: step, label: new Intl.DateTimeFormat("en-US", { month: scale === "weeks" ? "short" : undefined, day: "numeric", timeZone: "UTC" }).format(date) });
    }
  }
  const todayOffset = calendarDistance(window.start, today);
  return <div className="min-h-svh"><TrackerHeader active="timeline" /><main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
    <div><h1 className="text-3xl font-semibold tracking-tight">Timeline</h1><p className="mt-2 text-muted-foreground">See tasks, goals, and supplement writing deadlines.</p></div>
    <div className="tracker-panel flex flex-wrap items-end justify-between gap-4 p-4"><div className="flex flex-wrap gap-2" role="group" aria-label="Timeline scale">{(["days", "weeks", "months"] as const).map(value => <button className={`tracker-button ${scale === value ? "tracker-primary" : ""}`} key={value} aria-pressed={scale === value} onClick={() => setScale(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="flex flex-wrap items-end gap-2"><label className="text-sm font-medium" htmlFor="timeline-date">Starting date<input id="timeline-date" className="tracker-input mt-2" type="date" value={anchor} onChange={event => { if (validCalendarDate(event.target.value)) setAnchor(event.target.value); }} /></label><button className="tracker-button" onClick={() => setAnchor(shiftTimeline(anchor, scale, -1))}>Previous</button><button className="tracker-button" onClick={() => setAnchor(today)}>Today</button><button className="tracker-button" onClick={() => setAnchor(shiftTimeline(anchor, scale, 1))}>Next</button></div>
    </div>
    <p className="text-sm text-muted-foreground" aria-live="polite">{displayDate(window.start)} – {displayDate(addCalendarDays(window.end, -1))} · {rows.length} scheduled items in view</p>
    <section className="tracker-panel overflow-x-auto" aria-label="Work and supplement timeline">
      <div style={{ width: labelWidth + width }}>
        <div className="flex border-b bg-muted/30" style={{ minHeight: 52 }}><div className="sticky left-0 z-20 flex shrink-0 items-center border-r timeline-label px-4 text-sm font-medium" style={{ width: labelWidth }}>Scheduled work</div><div className="relative" style={{ width }}>{ticks.map(tick => <div key={tick.start} className="absolute inset-y-0 flex items-center justify-center border-r text-sm text-muted-foreground" style={{ left: tick.start * dayWidth, width: tick.days * dayWidth }}>{tick.label}</div>)}</div></div>
        {rows.map(({ row, span }) => <div className="flex border-b last:border-0" key={`${row.kind}:${row.id}`} style={{ minHeight: 88 }}>
          <div className="sticky left-0 z-20 shrink-0 border-r timeline-label px-4 py-3" style={{ width: labelWidth }}><Link href={row.href} className={`block break-words text-sm font-medium underline-offset-4 hover:underline ${row.completed ? "text-muted-foreground" : ""}`}>{row.title}</Link><p className="mt-1 text-sm text-muted-foreground">{rowLabels[row.kind]}{row.paused ? " · Paused" : row.completed ? " · Completed" : ""}{row.kind === "goal" ? ` · ${row.current}/${row.target}` : !row.completed ? ` · ${taskUrgency(row.end, false, today).label}` : ""}</p><p className="mt-1 text-sm text-muted-foreground">{row.start === row.end ? displayDate(row.end) : `${displayDate(row.start)} – ${displayDate(row.end)}`}</p></div>
          <div className="relative" style={{ width }}>
            {ticks.map(tick => <span key={tick.start} aria-hidden="true" className="absolute inset-y-0 border-l" style={{ left: tick.start * dayWidth }} />)}
            {todayOffset >= 0 && todayOffset < totalDays && <span className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-primary/60" style={{ left: (todayOffset + 0.5) * dayWidth }} aria-hidden="true" />}
            <Link
              href={row.href}
              aria-label={`${rowLabels[row.kind]}: ${row.title}, ${row.start === row.end ? displayDate(row.end) : `${displayDate(row.start)} through ${displayDate(row.end)}`}${span.before || span.after ? ", continues outside this range" : ""}`}
              title={`${row.title} · ${row.start === row.end ? displayDate(row.end) : `${displayDate(row.start)} – ${displayDate(row.end)}`}`}
              className={`absolute top-1/2 flex h-10 -translate-y-1/2 items-center ${row.completed ? "opacity-55" : ""}`}
              style={{ left: span.offset * dayWidth + 1, width: Math.max(4, span.days * dayWidth - 2) }}
            >
              <span className={`relative flex w-full items-center overflow-hidden rounded-sm ${row.marker ? "timeline-deadline-bar h-2" : "h-7"} ${row.kind === "goal" ? "bg-primary/15" : `task-timeline-bar task-urgency task-urgency-${taskUrgency(row.end, row.completed, today).tone}`}`}>
                {row.kind === "goal" && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-primary/35" style={{ width: `${row.progress}%` }} />}
                {span.days * dayWidth > 110 && <span aria-hidden="true" className="relative truncate px-3 text-xs">{span.before ? "… " : ""}{row.kind === "goal" ? `${row.current} / ${row.target}` : row.title}{span.after ? " …" : ""}</span>}
              </span>
            </Link>
          </div>
        </div>)}
      </div>
      {!rows.length && <div className="space-y-3 p-8"><h2 className="font-semibold">No scheduled work in this range</h2><p className="text-sm text-muted-foreground">Choose another date or schedule work.</p><div className="flex flex-wrap gap-3"><Link className="tracker-button" href="/tasks?new=1">Add task</Link><Link className="tracker-button" href="/goals">Manage goals</Link><Link className="tracker-button" href="/admissions">View admissions</Link></div></div>}
    </section>
    <p className="text-sm text-muted-foreground">Short bars mark due dates. Longer bars show scheduled spans. Goal fill shows progress and the dashed line marks today.</p>
    {all.rows.length > rows.length && <p className="text-sm text-muted-foreground">{all.rows.length - rows.length} scheduled items fall outside this date range.</p>}
    {all.unscheduled.length > 0 && <section className="tracker-panel space-y-4 p-5"><h2 className="font-semibold">Tasks without an end date</h2><p className="text-sm text-muted-foreground">These stay in your task list until you assign a due date.</p><ul className="space-y-3">{all.unscheduled.map(task => <li key={task.id}><Link className="text-sm underline underline-offset-4" href={`/tasks?task=${task.id}#task-${task.id}`}>{task.title}</Link>{task.start_date && <span className="ml-3 text-sm text-muted-foreground">Starts {displayDate(task.start_date)}</span>}</li>)}</ul></section>}
  </main></div>;
}
