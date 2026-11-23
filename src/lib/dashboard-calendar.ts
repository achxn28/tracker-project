import { addCalendarDays } from "./action-queue.ts";
import type { Task } from "./task-model.ts";
import type { GoalView } from "./goal-model.ts";

export type CalendarDeadline = { id: string; kind: "task" | "goal"; title: string; date: string; href: string };
export function calendarMonth(anchor: string) {
  const first = `${anchor.slice(0, 7)}-01`;
  const date = new Date(`${first}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCMonth(date.getUTCMonth() + 1);
  const next = date.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86400000);
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => addCalendarDays(first, index - offset));
}
export function shiftCalendarMonth(anchor: string, direction: number) {
  const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
export function calendarDeadlines(tasks: Pick<Task, "id" | "title" | "due_date" | "completed_at">[], goals: Pick<GoalView, "id" | "title" | "end_date" | "status" | "completed">[]): CalendarDeadline[] {
  return [
    ...tasks.filter(task => task.due_date && !task.completed_at).map(task => ({ id: task.id, kind: "task" as const, title: task.title, date: task.due_date!, href: `/tasks?task=${task.id}#task-${task.id}` })),
    ...goals.filter(goal => goal.status === "active" && !goal.completed).map(goal => ({ id: goal.id, kind: "goal" as const, title: goal.title, date: goal.end_date, href: `/goals?goal=${goal.id}#goal-${goal.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
