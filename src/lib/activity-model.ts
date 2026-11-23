import type { Opportunity } from "./opportunity-model.ts";

export const activityTypes = [
  "Initial email sent", "Follow-up email sent", "Reply received", "Application submitted",
  "Meeting scheduled", "Meeting completed", "Interview completed", "Offer received",
  "Rejection received", "General note", "Offer accepted",
] as const;
export type ActivityType = typeof activityTypes[number];
export type ActivityInput = { activity_type: ActivityType; occurred_at: string; notes: string | null; follow_up_date: string | null; positive_response?: boolean };
export type Activity = Omit<ActivityInput, "follow_up_date" | "positive_response"> & { id: string; opportunity_id: string; created_at: string; positive_response: number };

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function newYorkInput(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Match the entered wall time against offsets on either side of a DST change.
// Nonexistent spring times are rejected; repeated fall times use the earlier instant.
export function newYorkInstant(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const wall = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const offsets = new Set([-1, 0, 1].map(day => {
    const sample = wall + day * 86400000;
    return Date.parse(`${newYorkInput(new Date(sample))}:00Z`) - sample;
  }));
  const matches = [...offsets].map(offset => new Date(wall - offset))
    .filter(date => newYorkInput(date) === local).sort((a, b) => a.getTime() - b.getTime());
  return matches[0]?.toISOString() ?? null;
}

export function isOutreach(type: string) {
  return type === "Initial email sent" || type === "Follow-up email sent";
}

export function suggestedFollowUp(local: string) {
  if (!newYorkInstant(local)) return "";
  const date = new Date(`${local.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function displayActivityTime(instant: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(instant));
}

export function parseActivity(raw: Record<string, unknown>): { data: ActivityInput; errors?: never } | { data?: never; errors: Record<string, string> } {
  const text = (key: string) => typeof raw[key] === "string" ? raw[key].trim() : "";
  const errors: Record<string, string> = {};
  const type = text("activity_type") as ActivityType;
  if (!activityTypes.includes(type)) errors.activity_type = "Choose a valid activity type.";
  const positive_response = raw.positive_response === "on";
  if (positive_response && type !== "Reply received") errors.positive_response = "Only replies can be marked positive.";
  const occurred_at = newYorkInstant(text("occurred_at"));
  if (!occurred_at) errors.occurred_at = "Enter a valid New York date and time. Times skipped during daylight saving changes are not valid.";
  let follow_up_date: string | null = null;
  if (raw.schedule_follow_up === "on") {
    if (!isOutreach(type)) errors.schedule_follow_up = "Follow-up suggestions apply to emails only.";
    follow_up_date = text("follow_up_date");
    const date = new Date(`${follow_up_date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(follow_up_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== follow_up_date) errors.follow_up_date = "Enter a valid follow-up date.";
  }
  if (Object.keys(errors).length) return { errors };
  return { data: { activity_type: type, occurred_at: occurred_at!, notes: text("notes") || null, follow_up_date, positive_response } };
}

export function pipelineAfterActivity(opportunity: Opportunity, type: ActivityType) {
  const current = { status: opportunity.status, closed_outcome: opportunity.closed_outcome };
  if (opportunity.status === "Closed") return current;
  if (type === "Rejection received") return { status: "Closed" as const, closed_outcome: "rejected" as const };
  const targets: Partial<Record<ActivityType, Opportunity["status"]>> = {
    "Initial email sent": "Contacted / Applied", "Application submitted": "Contacted / Applied",
    "Reply received": "Responded", "Meeting scheduled": "Meeting / Interview",
    "Meeting completed": "Meeting / Interview", "Interview completed": "Meeting / Interview", "Offer received": "Offer", "Offer accepted": "Offer",
  };
  const progression = ["Saved", "Researching", "Ready for Outreach", "Contacted / Applied", "Responded", "Meeting / Interview", "Offer"];
  const target = targets[type];
  return target && progression.indexOf(target) > progression.indexOf(opportunity.status)
    ? { status: target, closed_outcome: null } : current;
}
