import { addCalendarDays } from "./action-queue.ts";
import type { Task } from "./task-model.ts";
import type { Opportunity } from "./opportunity-model.ts";
import type { Activity } from "./activity-model.ts";
import { sameActionTitle } from "./task-model.ts";
import type { GoalView } from "./goal-model.ts";

export type CalendarDeadline = { id: string; kind: "task" | "goal" | "application" | "follow_up" | "next_action"; title: string; date: string; href: string; context?: string };
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
export function calendarDeadlines(
  tasks: (Pick<Task, "id" | "title" | "due_date" | "completed_at"> & Partial<Pick<Task, "opportunity_id">>)[],
  goals: Pick<GoalView, "id" | "title" | "end_date" | "status" | "completed">[],
  opportunities: Opportunity[] = [],
  activities: Pick<Activity, "opportunity_id" | "activity_type">[] = [],
): CalendarDeadline[] {
  const pendingTasks = tasks.filter(task => task.due_date && !task.completed_at);
  const items: CalendarDeadline[] = [
    ...pendingTasks.map(task => ({ id: task.id, kind: "task" as const, title: task.title, date: task.due_date!, href: `/tasks?task=${task.id}#task-${task.id}` })),
    ...goals.filter(goal => goal.status === "active" && !goal.completed).map(goal => ({ id: goal.id, kind: "goal" as const, title: goal.title, date: goal.end_date, href: `/goals?goal=${goal.id}#goal-${goal.id}` })),
  ];
  const submitted = new Set(activities.filter(activity => activity.activity_type === "Application submitted").map(activity => activity.opportunity_id));
  for (const opportunity of opportunities) {
    if (opportunity.archived_at || opportunity.status === "Closed") continue;
    const href = `/opportunities?opportunity=${encodeURIComponent(opportunity.id)}`;
    if (opportunity.deadline && ["Saved", "Researching", "Ready for Outreach"].includes(opportunity.status) && !submitted.has(opportunity.id)) {
      items.push({ id: opportunity.id, kind: "application", title: opportunity.title, date: opportunity.deadline, href, context: opportunity.organization_name });
    }
    if (opportunity.next_action && opportunity.next_action_date) {
      const duplicate = pendingTasks.some(task => task.opportunity_id === opportunity.id && task.due_date === opportunity.next_action_date && sameActionTitle(task.title, opportunity.next_action!));
      if (!duplicate) items.push({ id: opportunity.id, kind: sameActionTitle(opportunity.next_action, "Send follow-up email") ? "follow_up" : "next_action", title: opportunity.next_action, date: opportunity.next_action_date, href, context: opportunity.organization_name });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}
