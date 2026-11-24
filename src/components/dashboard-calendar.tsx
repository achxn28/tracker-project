"use client";

import Link from "next/link";
import { useState } from "react";
import { calendarMonth, shiftCalendarMonth, type CalendarDeadline } from "@/lib/dashboard-calendar";
import { taskUrgency } from "@/lib/task-urgency";

const eventLabels: Record<CalendarDeadline["kind"], string> = { task: "Task", goal: "Goal deadline", application: "Application deadline", follow_up: "Planned follow-up", next_action: "Planned next action" };

const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function DashboardCalendar({ today, deadlines }: { today: string; deadlines: CalendarDeadline[] }) {
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(today);
  const dates = calendarMonth(month);
  const selectedDeadlines = deadlines.filter(item => item.date === selected);
  const counts = new Map<string, number>();
  for (const item of deadlines) counts.set(item.date, (counts.get(item.date) ?? 0) + 1);
  function move(direction: number) { const next = shiftCalendarMonth(month, direction); setMonth(next); setSelected(next); }
  return <section className="space-y-4" aria-labelledby="calendar-heading">
    <div className="flex items-center justify-between gap-3"><h2 id="calendar-heading" className="text-xl font-semibold tracking-tight">Calendar</h2><Link href="/timeline" className="text-sm text-primary underline-offset-4 hover:underline">Full timeline</Link></div>
    <div className="tracker-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5"><h3 className="font-semibold" aria-live="polite">{formatDate(month, { month: "long", year: "numeric" })}</h3><button className="min-h-9 rounded-sm px-2 text-sm text-primary hover:bg-muted" onClick={() => { setMonth(`${today.slice(0, 7)}-01`); setSelected(today); }}>Today</button></div>
      <div className="flex justify-between px-3 pb-2"><button className="min-h-9 rounded-sm px-2 text-xs text-muted-foreground hover:bg-muted" aria-label="Previous month" onClick={() => move(-1)}>Previous month</button><button className="min-h-9 rounded-sm px-2 text-xs text-muted-foreground hover:bg-muted" aria-label="Next month" onClick={() => move(1)}>Next month</button></div>
      <div className="px-3 pb-4"><div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span className="py-2" key={index}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a calendar date">{dates.map(date => {
          const count = counts.get(date) ?? 0;
          return <button key={date} className={`relative flex min-h-11 items-center justify-center rounded-sm text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${selected === date ? "bg-primary text-primary-foreground" : date === today ? "bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/30" : date.slice(0, 7) !== month.slice(0, 7) ? "text-muted-foreground/60 hover:bg-muted" : "hover:bg-muted"}`} aria-pressed={selected === date} aria-current={date === today ? "date" : undefined} aria-label={`${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${date === today ? ", today" : ""}, ${count} ${count === 1 ? "item" : "items"}`} onClick={() => { setSelected(date); if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(`${date.slice(0, 7)}-01`); }}>
            <span>{Number(date.slice(8))}</span>{count > 0 && <span aria-hidden="true" className={`absolute bottom-0.5 right-1 rounded px-1 text-xs leading-tight ${selected === date ? "bg-white/20" : "bg-primary/12 text-primary"}`}>{count}</span>}
          </button>;
        })}</div>
      </div>
      <div className="border-t px-5 py-4" aria-live="polite"><h3 className="text-sm font-semibold">{formatDate(selected, { weekday: "short", month: "short", day: "numeric" })}</h3>
        {selectedDeadlines.length ? <ul className="mt-3 space-y-2">{selectedDeadlines.map(item => <li key={`${item.kind}:${item.id}`}><Link className={`block rounded-sm border p-3 transition-colors hover:bg-muted ${item.kind === "task" ? `task-glass task-urgency task-urgency-${taskUrgency(item.date, false, today).tone}` : "bg-primary/5"}`} href={item.href}><span className="block break-words text-sm font-medium">{item.title}</span>{item.context && <span className="mt-1 block break-words text-sm text-muted-foreground">{item.context}</span>}<span className="mt-1 block text-xs text-muted-foreground">{item.kind === "task" ? `Task · ${taskUrgency(item.date, false, today).label}` : eventLabels[item.kind]}</span></Link></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled on this day.</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Tasks, goals, application deadlines, and planned next actions · New York dates</p>
      </div>
    </div>
  </section>;
}
