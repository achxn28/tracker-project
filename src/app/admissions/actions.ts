"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supplementStatuses, validDocsUrl, type SupplementStatus } from "@/lib/admissions-model";
import { importAdmissions, readAdmissionsPreview, saveCollege, saveSupplement } from "@/lib/admissions-store";
import { validCalendarDate } from "@/lib/timeline-model";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refresh() {
  for (const path of ["/admissions", "/timeline", "/"]) revalidatePath(path);
}

export async function saveApplication(id: string | null, form: FormData) {
  const name = field(form, "name");
  const round = field(form, "round");
  const deadline = field(form, "deadline");
  const docsUrl = field(form, "docsUrl");
  if (!name || (deadline && !validCalendarDate(deadline))) return "Enter a school name and a valid deadline.";
  if (docsUrl && !validDocsUrl(docsUrl)) return "Enter a Google Docs document or tab URL.";
  try {
    saveCollege({
      id: id ?? randomUUID(), name, round, deadline: deadline || null,
      submitted: form.has("submitted"), supplementsUnknown: form.has("supplementsUnknown"),
      docsUrl: docsUrl || null,
    });
  } catch {
    return "Could not save the school. Try again.";
  }
  refresh();
}

export async function saveEssay(id: string | null, collegeId: string, form: FormData) {
  const title = field(form, "title");
  const dueDate = field(form, "dueDate");
  const status = field(form, "status") as SupplementStatus;
  const wordLimit = field(form, "wordLimit");
  const docsUrl = field(form, "docsUrl");
  if (!title || !supplementStatuses.includes(status)) return "Enter a title and choose a status.";
  if (dueDate && !validCalendarDate(dueDate)) return "Enter a valid writing deadline.";
  if (wordLimit && (!/^\d+$/.test(wordLimit) || !Number.isSafeInteger(Number(wordLimit)) || Number(wordLimit) < 1)) {
    return "Enter a positive whole-number word limit.";
  }
  if (docsUrl && !validDocsUrl(docsUrl)) return "Enter a Google Docs document or tab URL.";
  try {
    saveSupplement({
      id: id ?? randomUUID(), collegeId, title, status, dueDate: dueDate || null,
      prompt: field(form, "prompt") || null, wordLimit: wordLimit ? Number(wordLimit) : null,
      docsUrl: docsUrl || null,
    });
  } catch {
    return "Could not save the supplement. Try again.";
  }
  refresh();
}

export async function confirmAdmissionsImport() {
  try {
    const data = readAdmissionsPreview();
    if (!data) return "The import file is unavailable.";
    importAdmissions(data);
  } catch {
    return "Could not import the school and supplement list. Try again.";
  }
  refresh();
}
