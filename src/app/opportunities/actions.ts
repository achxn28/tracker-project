"use server";

import { revalidatePath } from "next/cache";
import { parseOpportunity, type Opportunity } from "@/lib/opportunity-model";
import { withOpportunities } from "@/lib/opportunities";
import { parseActivity, type Activity } from "@/lib/activity-model";

function refreshWorkspace() {
  revalidatePath("/opportunities"); revalidatePath("/research"); revalidatePath("/tasks"); revalidatePath("/"); revalidatePath("/goals"); revalidatePath("/timeline");
}

export async function archiveOpportunity(id: string, archived: boolean): Promise<{ saved?: Opportunity; message?: string }> {
  if (typeof archived !== "boolean") return { message: "Choose a valid archive state." };
  try {
    const saved = withOpportunities(store => { if (!store.archive(id, archived)) throw new Error("missing"); return store.get(id)!; });
    refreshWorkspace(); return { saved };
  } catch { return { message: "The opportunity could not be archived or restored. Please try again." }; }
}

export async function getActivities(id: string): Promise<{ activities?: Activity[]; message?: string }> {
  try {
    return withOpportunities(store => store.get(id) ? { activities: store.activities(id) } : { message: "This opportunity no longer exists." });
  } catch { return { message: "Activity history could not be loaded. Please try again." }; }
}

export async function logActivity(id: string, form: FormData): Promise<{ saved?: Opportunity; activities?: Activity[]; errors?: Record<string, string>; message?: string }> {
  const result = parseActivity(Object.fromEntries(form));
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  let saved: Opportunity;
  let activities: Activity[];
  try {
    const response = withOpportunities(store => {
      store.logActivity(id, result.data);
      return { saved: store.get(id)!, activities: store.activities(id) };
    });
    saved = response.saved;
    activities = response.activities;
  } catch { return { message: "The activity could not be saved. Check that the opportunity still exists and is open if scheduling a follow-up." }; }
  refreshWorkspace();
  return { saved, activities };
}

export async function saveOpportunity(id: string | null, form: FormData): Promise<{ saved?: Opportunity; errors?: Record<string, string>; message?: string }> {
  const result = parseOpportunity(Object.fromEntries(form));
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  let saved: Opportunity;
  try {
    saved = withOpportunities(store => {
      const savedId = id ?? store.create(result.data);
      if (id && !store.update(id, result.data)) throw new Error("missing");
      return store.get(savedId)!;
    });
  } catch { return { message: "The opportunity could not be saved. Your entries are still here; please try again." }; }
  refreshWorkspace();
  return { saved };
}

export async function deleteOpportunity(id: string): Promise<{ message?: string }> {
  try { withOpportunities(store => store.delete(id)); }
  catch { return { message: "The opportunity could not be deleted. Please try again." }; }
  refreshWorkspace();
  return {};
}
