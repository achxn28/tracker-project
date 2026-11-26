"use server";

import { revalidatePath } from "next/cache";
import { withTrackerStore } from "@/lib/tracker-store";
import { goalWithProgress, parseGoal, type GoalView } from "@/lib/goal-model";

export async function saveGoal(id: string | null, form: FormData): Promise<{ saved?: GoalView; errors?: Record<string, string>; message?: string }> {
  const result = parseGoal(Object.fromEntries(form));
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  try {
    const saved = await withTrackerStore(async store => {
      const savedId = id ?? await store.createGoal(result.data);
      if (id && !(await store.updateGoal(id, result.data))) throw new Error("missing");
      const [goal, opportunities, activities, tasks] = await Promise.all([store.getGoal(savedId), store.list(), store.allActivities(), store.tasks()]);
      if (!goal) throw new Error("missing");
      return goalWithProgress(goal, { opportunities, activities, tasks });
    });
    revalidatePath("/goals"); revalidatePath("/"); revalidatePath("/timeline");
    return { saved };
  } catch { return { message: "The goal could not be saved. Your entries are still here; please try again." }; }
}

export async function deleteGoal(id: string): Promise<{ message?: string }> {
  try { await withTrackerStore(store => store.deleteGoal(id)); revalidatePath("/goals"); revalidatePath("/"); revalidatePath("/timeline"); return {}; }
  catch { return { message: "The goal could not be deleted. Please try again." }; }
}
