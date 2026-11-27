"use server";

import { revalidatePath } from "next/cache";
import { admissionsGoalId, goalWithProgress, parseGoal, parseGoalSchedule, type GoalView } from "@/lib/goal-model";
import { deleteAdmissionsGoal, readAdmissionsGoalProgress, saveAdmissionsGoal } from "@/lib/admissions-store";
import { withTrackerStore } from "@/lib/tracker-store";

function refreshGoals() {
  for (const path of ["/goals", "/timeline", "/"]) revalidatePath(path);
}

export async function saveGoal(id: string | null, form: FormData): Promise<{ saved?: GoalView; errors?: Record<string, string>; message?: string }> {
  const fields = Object.fromEntries(form);
  if (id === admissionsGoalId || (id === null && fields.metric_type === "all_supplements")) {
    const result = parseGoalSchedule(fields);
    if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
    try {
      saveAdmissionsGoal(result.data);
      const saved = readAdmissionsGoalProgress();
      if (!saved) return { message: "The admissions goal could not be loaded." };
      refreshGoals();
      return { saved };
    } catch {
      return { message: "The admissions goal could not be saved. Try again." };
    }
  }
  const result = parseGoal(fields);
  if (result.errors) return { errors: result.errors, message: "Check the highlighted fields." };
  try {
    const saved = await withTrackerStore(async store => {
      const savedId = id ?? await store.createGoal(result.data);
      if (id && !(await store.updateGoal(id, result.data))) throw new Error("missing");
      const [goal, opportunities, activities, tasks] = await Promise.all([store.getGoal(savedId), store.list(), store.allActivities(), store.tasks()]);
      if (!goal) throw new Error("missing");
      return goalWithProgress(goal, { opportunities, activities, tasks });
    });
    refreshGoals();
    return { saved };
  } catch { return { message: "The goal could not be saved. Your entries are still here; please try again." }; }
}

export async function deleteGoal(id: string): Promise<{ message?: string }> {
  try {
    if (id === admissionsGoalId) deleteAdmissionsGoal();
    else await withTrackerStore(store => store.deleteGoal(id));
    refreshGoals();
    return {};
  }
  catch { return { message: "The goal could not be deleted. Please try again." }; }
}
