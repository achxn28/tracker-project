export type Preferences = { theme: "light" | "dark"; follow_up_days: number };
export function parsePreferences(raw: Record<string, unknown>): { data: Preferences; errors?: never } | { data?: never; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const theme = raw.theme;
  const follow_up_days = typeof raw.follow_up_days === "string" ? Number(raw.follow_up_days) : NaN;
  if (theme !== "light" && theme !== "dark") errors.theme = "Choose Light or Dark.";
  if (!Number.isInteger(follow_up_days) || follow_up_days < 1 || follow_up_days > 365) errors.follow_up_days = "Choose a whole number from 1 to 365 days.";
  return Object.keys(errors).length ? { errors } : { data: { theme: theme as Preferences["theme"], follow_up_days } };
}
