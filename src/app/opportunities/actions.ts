"use server";

import { revalidatePath } from "next/cache";
import { parseOpportunity, type Opportunity } from "@/lib/opportunity-model";
import { withOpportunities } from "@/lib/opportunities";

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
  revalidatePath("/opportunities");
  return { saved };
}

export async function deleteOpportunity(id: string): Promise<{ message?: string }> {
  try { withOpportunities(store => store.delete(id)); }
  catch { return { message: "The opportunity could not be deleted. Please try again." }; }
  revalidatePath("/opportunities");
  return {};
}
