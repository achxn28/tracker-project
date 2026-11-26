"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { withTrackerStore } from "@/lib/tracker-store";
import { parsePreferences } from "@/lib/preferences-model";

export async function savePreferences(form: FormData): Promise<{ saved?: boolean; errors?: Record<string, string>; message?: string }> {
  const result = parsePreferences(Object.fromEntries(form));
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  try {
    await withTrackerStore(store => store.setFollowUpDays(result.data.follow_up_days));
    (await cookies()).set("tracker_theme", result.data.theme, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
    revalidatePath("/", "layout");
    return { saved: true };
  } catch { return { message: "Settings could not be saved. Please try again." }; }
}
