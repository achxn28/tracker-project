import { priorities } from "./opportunity-model.ts";

export const taskCategories = ["Research", "Startup", "Applications", "Portfolio / Projects", "Administration"] as const;
export type TaskInput = {
  title: string; description: string | null; category: typeof taskCategories[number];
  priority: typeof priorities[number]; opportunity_id: string | null; start_date: string | null; due_date: string | null;
};
export type Task = TaskInput & { id: string; completed_at: string | null; created_at: string; updated_at: string };
export const sameActionTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function parseTask(raw: Record<string, unknown>): { data: TaskInput; errors?: never } | { data?: never; errors: Record<string, string> } {
  const text = (key: string) => typeof raw[key] === "string" ? raw[key].trim() : "";
  const errors: Record<string, string> = {};
  const title = text("title");
  if (!title) errors.title = "Enter a task title.";
  const category = text("category") as TaskInput["category"];
  const priority = text("priority") as TaskInput["priority"];
  if (!taskCategories.includes(category)) errors.category = "Choose a valid category.";
  if (!priorities.includes(priority)) errors.priority = "Choose a valid priority.";
  const start_date = text("start_date") || null;
  const due_date = text("due_date") || null;
  for (const [key, value] of [["start_date", start_date], ["due_date", due_date]]) {
    if (!value) continue;
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) errors[key!] = "Enter a valid calendar date.";
  }
  if (start_date && due_date && start_date > due_date) errors.due_date = "The due date must be on or after the start date.";
  if (Object.keys(errors).length) return { errors };
  return { data: { title, category, priority, start_date, due_date, description: text("description") || null, opportunity_id: text("opportunity_id") || null } };
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || a.title.localeCompare(b.title));
}
