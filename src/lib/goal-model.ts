import type { Opportunity } from "./opportunity-model.ts";
import type { Activity } from "./activity-model.ts";
import { newYorkInput } from "./activity-model.ts";
import type { Task } from "./task-model.ts";
import { addCalendarDays } from "./action-queue.ts";

export const goalMetrics = {
  research_contacts: "Research contacts initially emailed",
  startup_contacts: "Startup contacts initially emailed",
  formal_applications: "Formal applications submitted",
  positive_responses: "Opportunities with positive replies",
  meetings_completed: "Opportunities with completed meetings / interviews",
  offers_received: "Offers received",
  offers_accepted: "Offers accepted",
  tasks_completed: "Tasks completed",
} as const;
export type Metric = keyof typeof goalMetrics;
export type GoalInput = { title: string; metric_type: Metric; target_count: number; start_date: string; end_date: string; status: "active" | "paused" };
export type Goal = GoalInput & { id: string; created_at: string; updated_at: string };
export type GoalView = Goal & { current: number; percentage: number; completed: boolean };
export type MetricData = { opportunities: Opportunity[]; activities: Activity[]; tasks: Task[] };

export function parseGoal(raw: Record<string, unknown>): { data: GoalInput; errors?: never } | { data?: never; errors: Record<string, string> } {
  const text = (key: string) => typeof raw[key] === "string" ? raw[key].trim() : "";
  const errors: Record<string, string> = {};
  const title = text("title");
  const metric_type = text("metric_type") as Metric;
  const target_count = Number(text("target_count"));
  const start_date = text("start_date"), end_date = text("end_date");
  const status = text("status") as GoalInput["status"];
  if (!title) errors.title = "Enter a goal title.";
  if (!Object.hasOwn(goalMetrics, metric_type)) errors.metric_type = "Choose a valid metric.";
  if (!Number.isSafeInteger(target_count) || target_count < 1) errors.target_count = "Enter a positive whole-number target.";
  if (!["active", "paused"].includes(status)) errors.status = "Choose Active or Paused.";
  for (const [key, value] of [["start_date", start_date], ["end_date", end_date]]) {
    const date = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) errors[key] = "Enter a valid calendar date.";
  }
  if (start_date > end_date) errors.end_date = "The deadline must be on or after the start date.";
  return Object.keys(errors).length ? { errors } : { data: { title, metric_type, target_count, start_date, end_date, status } };
}

// Each opportunity reaches a metric's milestone once. Its earliest qualifying
// event determines the period, so duplicate initial outreach in another week
// never creates a second new contact.
export function metricProgress(metric: Metric, data: MetricData, start: string, end: string, now = new Date()) {
  const inPeriod = (instant: string) => {
    if (instant > now.toISOString()) return false;
    const date = newYorkInput(new Date(instant)).slice(0, 10);
    return date >= start && date <= end;
  };
  if (metric === "tasks_completed") return data.tasks.filter(task => task.completed_at && inPeriod(task.completed_at)).length;
  const types = new Map(data.opportunities.map(item => [item.id, item.type]));
  const earliest = new Map<string, string>();
  for (const activity of data.activities) {
    const type = types.get(activity.opportunity_id);
    if (!type) continue;
    const matches = metric === "research_contacts" ? type === "Research" && activity.activity_type === "Initial email sent"
      : metric === "startup_contacts" ? type === "Startup" && activity.activity_type === "Initial email sent"
      : metric === "formal_applications" ? type === "Formal Internship" && activity.activity_type === "Application submitted"
      : metric === "positive_responses" ? activity.activity_type === "Reply received" && activity.positive_response === 1
      : metric === "meetings_completed" ? ["Meeting completed", "Interview completed"].includes(activity.activity_type)
      : metric === "offers_received" ? activity.activity_type === "Offer received"
      : activity.activity_type === "Offer accepted";
    if (matches && (!earliest.has(activity.opportunity_id) || activity.occurred_at < earliest.get(activity.opportunity_id)!)) earliest.set(activity.opportunity_id, activity.occurred_at);
  }
  return [...earliest.values()].filter(inPeriod).length;
}

export function goalWithProgress(goal: Goal, data: MetricData, now = new Date()): GoalView {
  const current = metricProgress(goal.metric_type, data, goal.start_date, goal.end_date, now);
  return { ...goal, current, percentage: Math.min(100, current / goal.target_count * 100), completed: current >= goal.target_count };
}

export function goalTemplates(today: string): GoalInput[] {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addCalendarDays(today, -((weekday + 6) % 7));
  const base = (title: string, metric_type: Metric, target_count: number, start_date: string, end_date: string): GoalInput => ({ title, metric_type, target_count, start_date, end_date: end_date < start_date ? start_date : end_date, status: "active" });
  return [
    base("Research outreach", "research_contacts", 80, today, "2027-03-31"),
    base("Startup outreach", "startup_contacts", 50, today, "2027-03-31"),
    base("Formal applications", "formal_applications", 10, today, "2027-03-31"),
    base("Secure a summer opportunity", "offers_accepted", 1, today, "2027-05-31"),
    base("Weekly research outreach", "research_contacts", 8, monday, addCalendarDays(monday, 6)),
    base("Weekly startup outreach", "startup_contacts", 5, monday, addCalendarDays(monday, 6)),
    base("Weekly formal applications", "formal_applications", 2, monday, addCalendarDays(monday, 6)),
  ];
}
