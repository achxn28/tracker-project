export type UrgencyTone = "green" | "yellow" | "amber" | "red" | "neutral";

// Use calendar dates supplied in the workspace's New York timezone.
export function taskUrgency(dueDate: string | null, completed: boolean, today: string): { tone: UrgencyTone; label: string } {
  if (completed) return { tone: "neutral", label: "Completed" };
  if (!dueDate) return { tone: "neutral", label: "No due date" };
  const days = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (!Number.isFinite(days)) return { tone: "neutral", label: "No valid due date" };
  if (days < 0) return { tone: "red", label: `${-days} ${days === -1 ? "day" : "days"} overdue` };
  if (days === 0) return { tone: "red", label: "Due today" };
  return { tone: days <= 3 ? "amber" : days <= 7 ? "yellow" : "green", label: days === 1 ? "Due tomorrow" : `${days} days left` };
}
