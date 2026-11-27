"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { todayInNewYork } from "@/lib/action-queue";
import { decryptGmailData, encryptGmailData } from "@/lib/gmail-local-data";
import { ollamaTaskSamples } from "@/lib/ollama-task-samples";
import { suggestTaskLocally, type TaskSuggestion } from "@/lib/ollama-task-suggestion";
import { parseTask } from "@/lib/task-model";
import { withTrackerStore } from "@/lib/tracker-store";

export type SampleFeedback = {
  draft?: TaskSuggestion & { token: string };
  taskId?: string;
  message?: string;
  error?: boolean;
};

export async function updateSampleSuggestion(previous: SampleFeedback, form: FormData): Promise<SampleFeedback> {
  const operation = form.get("operation");
  try {
    const host = (await headers()).get("host") ?? "";
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new Error("Open local Tracker to use Ollama.");
    if (operation === "dismiss") return { message: "Suggestion dismissed." };

    const key = process.env.GMAIL_DATA_KEY?.trim();
    if (!key || !/^[a-f\d]{64}$/i.test(key)) throw new Error("The local Tracker encryption key is missing.");
    const secret = Buffer.from(key, "hex");
    const samples = ollamaTaskSamples(todayInNewYork());

    if (operation === "suggest") {
      const sample = samples.find(item => item.id === form.get("sample"));
      if (!sample) throw new Error("Choose a sample email.");
      const result = await suggestTaskLocally(sample.text);
      if (!result) return { message: "This email has no task to suggest." };
      const token = encryptGmailData(secret, "task-draft", sample.id).toString("base64url");
      return { draft: { ...result, token } };
    }

    if (operation !== "approve") throw new Error("Choose a suggestion action.");
    const token = form.get("token");
    if (typeof token !== "string" || !/^[\w-]{40,200}$/.test(token)) throw new Error("Generate a suggestion before approving it.");
    let sampleId;
    try { sampleId = decryptGmailData(secret, "task-draft", Buffer.from(token, "base64url")); }
    catch { throw new Error("Generate this suggestion again before approving it."); }
    if (!samples.some(sample => sample.id === sampleId)) throw new Error("This sample is no longer available.");
    const title = form.get("title");
    if (typeof title !== "string" || title.trim().length > 120) throw new Error("Enter a task title up to 120 characters.");
    const task = parseTask({
      title, due_date: form.get("due_date"), category: "Research", priority: "medium",
      description: "Created from a sample email in the Ollama pilot.",
    });
    if (!task.data) throw new Error(task.errors.title ?? task.errors.due_date ?? "Check the task details.");
    const approved = task.data;
    let taskId: string;
    try { taskId = await withTrackerStore(store => store.createTask(approved, `ollama-sample-${sampleId}`)); }
    catch { throw new Error("The task could not be saved. Try approving again."); }
    for (const path of ["/", "/tasks", "/timeline", "/goals"]) revalidatePath(path);
    return { taskId, message: "The sample task is in Tasks." };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Ollama took too long to analyze the sample. Try again."
      : error instanceof Error ? error.message : "The sample could not be processed.";
    return { draft: operation === "approve" ? previous.draft : undefined, error: true, message };
  }
}
