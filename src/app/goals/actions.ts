"use server";

import { revalidatePath } from "next/cache";
import { withOpportunities } from "@/lib/opportunities";
import { goalWithProgress, parseGoal, type GoalView } from "@/lib/goal-model";

export async function saveGoal(id: string | null, form: FormData): Promise<{ saved?: GoalView; errors?: Record<string, string>; message?: string }> {
  const result = parseGoal(Object.fromEntries(form));
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  try {
    const saved = withOpportunities(store => {
      const savedId = id ?? store.createGoal(result.data);
      if (id && !store.updateGoal(id, result.data)) throw new Error("missing");
      return goalWithProgress(store.goals().find(goal => goal.id === savedId)!, { opportunities: store.list(), activities: store.allActivities(), tasks: store.tasks() });
    });
    revalidatePath("/goals"); revalidatePath("/"); revalidatePath("/timeline");
    return { saved };
  } catch { return { message: "The goal could not be saved. Your entries are still here; please try again." }; }
}

export async function deleteGoal(id: string): Promise<{ message?: string }> {
  try { withOpportunities(store => store.deleteGoal(id)); revalidatePath("/goals"); revalidatePath("/"); revalidatePath("/timeline"); return {}; }
  catch { return { message: "The goal could not be deleted. Please try again." }; }
}
