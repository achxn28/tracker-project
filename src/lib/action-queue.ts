import { newYorkInput, type Activity } from "./activity-model.ts";
import type { Opportunity } from "./opportunity-model.ts";
import { sameActionTitle, type Task } from "./task-model.ts";

export const queueSections = ["Overdue", "Approaching deadlines", "Due today", "Upcoming", "Ready for outreach"] as const;
export type QueueItem = { id: string; kind: "task" | "next_action" | "deadline" | "ready"; title: string; context: string; date: string | null; section: typeof queueSections[number]; href: string; opportunity_id: string | null; priority: Opportunity["priority"] };
export const todayInNewYork = (now = new Date()) => newYorkInput(now).slice(0, 10);
export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildActionQueue(opportunities: Opportunity[], tasks: Task[], activities: Activity[], today = todayInNewYork()): QueueItem[] {
  const end = addCalendarDays(today, 7);
  const items: QueueItem[] = [];
  const names = new Map(opportunities.map(item => [item.id, item.organization_name]));
  const openTasks = tasks.filter(task => !task.completed_at);
  const sectionFor = (date: string) => date < today ? "Overdue" : date === today ? "Due today" : "Upcoming";
  for (const task of openTasks) {
    if (!task.due_date || task.due_date > end) continue;
    items.push({ id: task.id, kind: "task", title: task.title, context: task.opportunity_id ? names.get(task.opportunity_id) ?? task.category : task.category, date: task.due_date, section: sectionFor(task.due_date), href: `/tasks?task=${encodeURIComponent(task.id)}#task-${task.id}`, opportunity_id: task.opportunity_id, priority: task.priority });
  }
  for (const opportunity of opportunities) {
    if (opportunity.status === "Closed") continue;
    const href = `/opportunities?opportunity=${encodeURIComponent(opportunity.id)}`;
    const history = activities.filter(activity => activity.opportunity_id === opportunity.id);
    const duplicate = openTasks.some(task => task.opportunity_id === opportunity.id && task.due_date === opportunity.next_action_date && sameActionTitle(task.title, opportunity.next_action ?? ""));
    if (opportunity.next_action && opportunity.next_action_date && opportunity.next_action_date <= end && !duplicate) {
      items.push({ id: opportunity.id, kind: "next_action", title: opportunity.next_action, context: opportunity.organization_name, date: opportunity.next_action_date, section: sectionFor(opportunity.next_action_date), href, opportunity_id: opportunity.id, priority: opportunity.priority });
    }
    if (opportunity.deadline && opportunity.deadline >= today && opportunity.deadline <= end && ["Saved", "Researching", "Ready for Outreach"].includes(opportunity.status) && !history.some(activity => activity.activity_type === "Application submitted")) {
      items.push({ id: opportunity.id, kind: "deadline", title: `Application deadline: ${opportunity.title}`, context: opportunity.organization_name, date: opportunity.deadline, section: "Approaching deadlines", href, opportunity_id: opportunity.id, priority: opportunity.priority });
    }
    if (opportunity.status === "Ready for Outreach" && !items.some(item => item.opportunity_id === opportunity.id)) {
      items.push({ id: opportunity.id, kind: "ready", title: opportunity.title, context: opportunity.organization_name, date: null, section: "Ready for outreach", href, opportunity_id: opportunity.id, priority: opportunity.priority });
    }
  }
  const priorities = ["high", "medium", "low"];
  return items.sort((a, b) => queueSections.indexOf(a.section) - queueSections.indexOf(b.section) || (a.date ?? "9999").localeCompare(b.date ?? "9999") || priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || a.title.localeCompare(b.title));
}
