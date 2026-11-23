"use server";

import { revalidatePath } from "next/cache";
import { parseTask, type Task } from "@/lib/task-model";
import { withOpportunities } from "@/lib/opportunities";

function refreshWorkspace() {
  revalidatePath("/"); revalidatePath("/tasks"); revalidatePath("/opportunities");
}

export async function saveTask(id: string | null, form: FormData): Promise<{ saved?: Task; errors?: Record<string, string>; message?: string }> {
  const parsed = parseTask(Object.fromEntries(form));
  if (parsed.errors) return { errors: parsed.errors, message: "Check the highlighted fields." };
  try {
    const result = withOpportunities(store => {
      if (parsed.data.opportunity_id && !store.get(parsed.data.opportunity_id)) return { errors: { opportunity_id: "This opportunity no longer exists. Choose another or leave it standalone." } };
      const savedId = id ?? store.createTask(parsed.data);
      if (id && !store.updateTask(id, parsed.data)) throw new Error("missing");
      return { saved: store.getTask(savedId)! };
    });
    refreshWorkspace();
    return result;
  } catch { return { message: "The task could not be saved. Your entries are still here; please try again." }; }
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<{ saved?: Task; message?: string }> {
  if (typeof completed !== "boolean") return { message: "Choose a valid completion state." };
  try {
    const saved = withOpportunities(store => { store.completeTask(id, completed); return store.getTask(id)!; });
    refreshWorkspace();
    return { saved };
  } catch { return { message: "The task could not be updated. Refresh the page and try again." }; }
}

export async function deleteTask(id: string): Promise<{ message?: string }> {
  try { withOpportunities(store => store.deleteTask(id)); refreshWorkspace(); return {}; }
  catch { return { message: "The task could not be deleted. Please try again." }; }
}

export async function clearNextAction(id: string, title: string, date: string): Promise<{ message?: string }> {
  try {
    const cleared = withOpportunities(store => store.clearNextAction(id, title, date));
    refreshWorkspace();
    return cleared ? {} : { message: "This next action has changed. Refresh the dashboard before clearing it." };
  } catch { return { message: "The next action could not be cleared. Please try again." }; }
}
