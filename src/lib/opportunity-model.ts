export const opportunityTypes = ["Research", "Startup", "Formal Internship"] as const;
export const statuses = ["Saved", "Researching", "Ready for Outreach", "Contacted / Applied", "Responded", "Meeting / Interview", "Offer", "Closed"] as const;
export const priorities = ["high", "medium", "low"] as const;
export const arrangements = ["onsite", "hybrid", "remote", "unspecified"] as const;
export const outcomes = ["rejected", "withdrawn", "no longer pursuing"] as const;
export const optionalFields = ["contact_name", "contact_email", "website_url", "application_url", "location", "technical_focus", "fit_notes", "outreach_notes", "deadline", "next_action", "next_action_date", "notes"] as const;
export type OptionalField = typeof optionalFields[number];
export type OpportunityInput = Record<OptionalField, string | null> & {
  organization_name: string;
  title: string;
  type: typeof opportunityTypes[number];
  status: typeof statuses[number];
  priority: typeof priorities[number];
  work_arrangement: typeof arrangements[number];
  closed_outcome: typeof outcomes[number] | null;
};
export type Opportunity = OpportunityInput & { id: string; created_at: string; updated_at: string };
export type FormState = { errors?: Record<string, string>; message?: string };

export function statusLabel(status: string, type: string) {
  return status === "Contacted / Applied" ? (type === "Formal Internship" ? "Submitted" : "Contacted") : status;
}

export function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(`${value}T12:00:00Z`)) : "—";
}

export function parseOpportunity(raw: Record<string, unknown>): { data: OpportunityInput; errors?: never } | { data?: never; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = (key: string) => typeof raw[key] === "string" ? raw[key].trim() : "";
  const organization_name = text("organization_name");
  const title = text("title");
  if (!organization_name) errors.organization_name = "Enter an organization or university.";
  if (!title) errors.title = "Enter a title or research focus.";
  function choice<T extends string>(key: string, options: readonly T[], fallback?: T): T {
    const value = text(key) || fallback;
    if (!options.includes(value as T)) errors[key] = "Choose a valid option.";
    return value as T;
  }
  const type = choice("type", opportunityTypes);
  const status = choice("status", statuses);
  const priority = choice("priority", priorities, "medium");
  const work_arrangement = choice("work_arrangement", arrangements, "unspecified");
  const fields = Object.fromEntries(optionalFields.map(key => [key, text(key) || null])) as Record<OptionalField, string | null>;
  for (const key of ["website_url", "application_url"] as const) {
    if (!fields[key]) continue;
    try {
      const url = new URL(fields[key]);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch { errors[key] = "Enter a complete http:// or https:// URL."; }
  }
  if (fields.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contact_email)) errors.contact_email = "Enter a valid email address.";
  for (const key of ["deadline", "next_action_date"] as const) {
    const value = fields[key];
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) errors[key] = "Enter a valid calendar date.";
  }
  const closed_outcome = status === "Closed" ? text("closed_outcome") || null : null;
  if (closed_outcome && !outcomes.includes(closed_outcome as typeof outcomes[number])) errors.closed_outcome = "Choose a valid outcome.";
  if (Object.keys(errors).length) return { errors };
  return { data: { organization_name, title, type, status, priority, work_arrangement, ...fields, closed_outcome: closed_outcome as OpportunityInput["closed_outcome"] } };
}
