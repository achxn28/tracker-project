"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateSampleSuggestion } from "@/app/research/gmail/suggestions/actions";
import type { ollamaTaskSamples } from "@/lib/ollama-task-samples";

type Samples = ReturnType<typeof ollamaTaskSamples>;

export function OllamaTaskPilot({ samples }: { samples: Samples }) {
  const [selected, setSelected] = useState<Samples[number]["id"]>(samples[0].id);
  const [feedback, action, pending] = useActionState(updateSampleSuggestion, {});
  const sample = samples.find(item => item.id === selected);

  return <div className="space-y-6">
    <form action={action} className="tracker-panel space-y-4 p-5">
      <fieldset disabled={pending} className="space-y-4">
        <label className="block max-w-md text-sm font-medium">Sample email
          <select className="tracker-input mt-2" value={selected} name="sample" onChange={event => setSelected(event.target.value as typeof selected)}>
            {samples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <blockquote className="border-l-2 border-primary/35 pl-4 text-sm leading-relaxed">{sample?.text}</blockquote>
        <button name="operation" value="suggest" className="tracker-button tracker-primary">{pending ? "Working…" : "Suggest task"}</button>
      </fieldset>
    </form>
    {feedback.message && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-destructive" : "text-muted-foreground"}>
      {feedback.message}
    </p>}
    {feedback.taskId && <Link className="tracker-button" href={`/tasks?task=${feedback.taskId}#task-${feedback.taskId}`}>Open task</Link>}
    {feedback.draft && <form key={feedback.draft.token} action={action} className="tracker-panel space-y-4 p-5">
      <h2 className="font-semibold">Review suggestion</h2>
      <blockquote className="border-l-2 border-primary/35 pl-4 text-sm leading-relaxed">{feedback.draft.evidence}</blockquote>
      <input type="hidden" name="token" value={feedback.draft.token} />
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Task title<input className="tracker-input mt-2" name="title" defaultValue={feedback.draft.title} required maxLength={120} /></label>
          <label className="text-sm font-medium">Due date<input className="tracker-input mt-2" type="date" name="due_date" defaultValue={feedback.draft.dueDate ?? ""} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button name="operation" value="approve" className="tracker-button tracker-primary">Approve sample task</button>
          <button name="operation" value="dismiss" className="tracker-button" formNoValidate>Dismiss</button>
        </div>
      </fieldset>
    </form>}
  </div>;
}
