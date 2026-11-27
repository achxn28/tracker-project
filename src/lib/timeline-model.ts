import { addCalendarDays } from "./action-queue.ts";
import { supplementHref, type AdmissionsData } from "./admissions-model.ts";
import type { Task } from "./task-model.ts";
import type { GoalView } from "./goal-model.ts";

export type TimelineScale = "days" | "weeks" | "months";
export type TimelineRow = { id: string; kind: "task" | "goal" | "supplement"; title: string; start: string; end: string; marker: boolean; href: string; completed: boolean; paused: boolean; current?: number; target?: number; progress?: number };
export const calendarDistance = (start: string, end: string) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
export function validCalendarDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function timelineWindow(anchor: string, scale: TimelineScale) {
  if (!validCalendarDate(anchor)) throw new Error("Invalid timeline date");
  if (scale !== "months") return { start: anchor, end: addCalendarDays(anchor, scale === "days" ? 14 : 56) };
  const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  const start = date.toISOString().slice(0, 10);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}
export function shiftTimeline(anchor: string, scale: TimelineScale, direction: number) {
  const window = timelineWindow(anchor, scale);
  if (scale !== "months") return addCalendarDays(anchor, (scale === "days" ? 14 : 56) * direction);
  const date = new Date(`${window.start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 6 * direction);
  return date.toISOString().slice(0, 10);
}
export function timelineRows(tasks: Task[], goals: GoalView[], admissions?: AdmissionsData): { rows: TimelineRow[]; unscheduled: Task[] } {
  const schools = new Map(admissions?.colleges.map(college => [college.id, college.name]));
  return {
    rows: [
      ...goals.map(goal => ({ id: goal.id, kind: "goal" as const, title: goal.title, start: goal.start_date, end: goal.end_date, marker: false, href: `/goals?goal=${goal.id}#goal-${goal.id}`, completed: goal.completed, paused: goal.status === "paused", current: goal.current, target: goal.target_count, progress: goal.percentage })),
      ...tasks.filter(task => task.due_date).map(task => ({ id: task.id, kind: "task" as const, title: task.title, start: task.start_date ?? task.due_date!, end: task.due_date!, marker: !task.start_date, href: `/tasks?task=${task.id}#task-${task.id}`, completed: Boolean(task.completed_at), paused: false })),
      ...(admissions?.supplements ?? []).flatMap((essay): TimelineRow[] => essay.dueDate ? [{
        id: essay.id, kind: "supplement", title: `${schools.get(essay.collegeId) ?? "Admissions"} · ${essay.title}`,
        start: essay.dueDate, end: essay.dueDate, marker: true, href: supplementHref(essay),
        completed: essay.status === "Done", paused: false,
      }] : []),
    ].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)),
    unscheduled: tasks.filter(task => !task.due_date),
  };
}
export function clipTimelineSpan(row: Pick<TimelineRow, "start" | "end">, window: { start: string; end: string }) {
  const end = addCalendarDays(row.end, 1);
  if (end <= window.start || row.start >= window.end) return null;
  const clippedStart = row.start < window.start ? window.start : row.start;
  const clippedEnd = end > window.end ? window.end : end;
  return { offset: calendarDistance(window.start, clippedStart), days: calendarDistance(clippedStart, clippedEnd), before: row.start < window.start, after: end > window.end };
}
