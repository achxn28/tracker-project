"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QueueControls } from "@/components/queue-controls";
import { TrackerHeader } from "@/components/tracker-header";
import { deleteTask, saveTask, setTaskCompleted } from "@/app/tasks/actions";
import { displayDate, priorities, type Opportunity } from "@/lib/opportunity-model";
import type { ScheduledSupplement } from "@/lib/admissions-model";
import { taskUrgency } from "@/lib/task-urgency";
import { sortTasks, taskCategories, type Task } from "@/lib/task-model";

const defaults = (opportunityId: string) => ({ title: "", description: "", category: "Administration", priority: "medium", opportunity_id: opportunityId, start_date: "", due_date: "" });

export function TaskManager({ initialTasks, supplements, opportunities, today, initialOpportunityId, initialTaskId, initiallyAdding }: { initialTasks: Task[]; supplements: ScheduledSupplement[]; opportunities: Opportunity[]; today: string; initialOpportunityId: string; initialTaskId: string; initiallyAdding: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [editing, setEditing] = useState(initiallyAdding);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(defaults(initialOpportunityId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [association, setAssociation] = useState(initialOpportunityId);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const names = new Map(opportunities.map(item => [item.id, item.organization_name]));
  const taskEntries = tasks.filter(task =>
    (!category || task.category === category) && (!priority || task.priority === priority) &&
    (!status || (status === "completed" ? Boolean(task.completed_at) : !task.completed_at)) &&
    (!association || (association === "standalone" ? !task.opportunity_id : task.opportunity_id === association))
  ).map(task => ({ kind: "task" as const, ...task }));
  const showSupplements = (!category || category === "Applications") && (!priority || priority === "medium") &&
    (!association || association === "standalone");
  const supplementEntries = showSupplements ? supplements.filter(essay =>
    !status || (status === "completed" ? essay.status === "Done" : essay.status !== "Done")
  ).map(essay => ({ kind: "supplement" as const, ...essay, due_date: essay.dueDate, priority: "medium" as const })) : [];
  const filtered = sortTasks([...taskEntries, ...supplementEntries]);
  function edit(task: Task | null) {
    setEditingId(task?.id ?? null); setEditing(true); setMessage(""); setErrors({}); setConfirming(null);
    setDraft(task ? Object.fromEntries(Object.entries(task).map(([key, value]) => [key, value ?? ""])) : defaults(association && association !== "standalone" ? association : ""));
  }
  function accept(saved: Task) { setTasks(current => current.some(task => task.id === saved.id) ? current.map(task => task.id === saved.id ? saved : task) : [...current, saved]); }
  function field(key: string, label: string, options: { choices?: readonly string[]; date?: boolean; required?: boolean; multiline?: boolean } = {}) {
    const props = { id: `task-${key}`, name: key, value: draft[key] ?? "", required: options.required, className: "tracker-input", "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `task-${key}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft(current => ({ ...current, [key]: event.target.value })) };
    return <div key={key} className={`min-w-0 ${options.multiline ? "sm:col-span-2" : ""}`}><label className="mb-2 block text-sm font-medium" htmlFor={`task-${key}`}>{label}{options.required && " *"}</label>
      {key === "opportunity_id" ? <select {...props}><option value="">Standalone task</option>{opportunities.map(item => <option value={item.id} key={item.id}>{item.organization_name} — {item.title}</option>)}</select> : options.choices ? <select {...props}>{options.choices.map(value => <option value={value} key={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select> : options.multiline ? <textarea {...props} rows={3} /> : <input {...props} type={options.date ? "date" : "text"} />}
      {errors[key] && <p role="alert" className="mt-2 text-sm text-destructive" id={`task-${key}-error`}>{errors[key]}</p>}</div>;
  }
  return <div className="min-h-svh"><TrackerHeader active="tasks" /><main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Tasks</h1><p className="mt-2 text-muted-foreground">Keep track of your tasks and upcoming supplement work.</p></div>{!editing && <button className="tracker-button tracker-primary" disabled={pending} onClick={() => edit(null)}>Add task</button>}</div>
    {message && <p role="alert" className="mb-5 text-sm text-destructive">{message}</p>}
    {editing && <form className="tracker-panel mb-7 space-y-5 p-6" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      startTransition(async () => {
        try { const result = await saveTask(editingId, form); if (!result.saved) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Check the highlighted fields."); return; } accept(result.saved); setEditing(false); setMessage(""); setErrors({}); router.replace(`/tasks?task=${result.saved.id}#task-${result.saved.id}`); }
        catch { setMessage("Couldn’t reach the app. Your entries are still here; please try again."); }
      });
    }}><h2 className="text-lg font-semibold">{editingId ? "Edit task" : "Add task"}</h2><fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2"><legend className="sr-only">Task details</legend>
      {field("title", "Title", { required: true })}{field("opportunity_id", "Opportunity (optional)")}{field("category", "Category", { required: true, choices: taskCategories })}{field("priority", "Priority", { required: true, choices: priorities })}{field("start_date", "Start date (optional)", { date: true })}{field("due_date", "Due date (optional)", { date: true })}{field("description", "Description (optional)", { multiline: true })}
    </fieldset><div className="flex flex-wrap gap-3"><button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : "Save task"}</button><button type="button" className="tracker-button" disabled={pending} onClick={() => { setEditing(false); setMessage(""); setErrors({}); router.replace(initialOpportunityId ? `/tasks?opportunity=${initialOpportunityId}` : "/tasks"); }}>Cancel task</button></div></form>}
    <div className="tracker-panel mb-5 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium">Category<select className="tracker-input mt-2" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{taskCategories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm font-medium">Priority<select className="tracker-input mt-2" value={priority} onChange={event => setPriority(event.target.value)}><option value="">All priorities</option>{priorities.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label className="text-sm font-medium">Completion<select className="tracker-input mt-2" value={status} onChange={event => setStatus(event.target.value)}><option value="">All tasks</option><option value="open">Pending</option><option value="completed">Completed</option></select></label>
      <label className="text-sm font-medium">Linked opportunity<select className="tracker-input mt-2" value={association} onChange={event => setAssociation(event.target.value)}><option value="">All opportunities</option><option value="standalone">Standalone tasks</option>{opportunities.map(item => <option key={item.id} value={item.id}>{item.organization_name}</option>)}</select></label>
    </div>
    <section aria-label="Task list"><div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "task" : "tasks"} · Sorted by due date<span>Green → Yellow → Amber → Red as the due date approaches</span></div>
      {filtered.length ? <ul className="space-y-3">{filtered.map(task => {
        if (task.kind === "supplement") {
          const done = task.status === "Done";
          const urgency = taskUrgency(task.dueDate, done, today);
          return <li key={`supplement:${task.id}`} className={`tracker-panel task-glass task-urgency task-urgency-${urgency.tone} flex flex-wrap items-start justify-between gap-4 p-5`}>
            <div className="min-w-0 flex-1">
              <h2 className={`break-words font-semibold ${done ? "text-muted-foreground line-through" : ""}`}><Link className="underline-offset-4 hover:underline" href={task.href}>{task.title}</Link></h2>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{task.school}</span><span>Supplement · {task.status}</span>
                {!done && <span className="task-urgency-label font-medium">{urgency.label}</span>}
                <span>{displayDate(task.dueDate)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="tracker-button" href={task.href}>View supplement</Link>
              {!done && <QueueControls item={{ kind: task.kind, id: task.id, title: task.title, date: task.dueDate, context: task.school }} />}
            </div>
          </li>;
        }
        const urgency = taskUrgency(task.due_date, Boolean(task.completed_at), today); return <li id={`task-${task.id}`} key={`task:${task.id}`} className={`tracker-panel task-glass task-urgency task-urgency-${urgency.tone} scroll-mt-5 space-y-3 p-5 ${initialTaskId === task.id ? "ring-2 ring-primary/40" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className={`break-words font-semibold ${task.completed_at ? "text-muted-foreground line-through" : ""}`}>{task.title}</h2>{task.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{task.category}</span><span className="capitalize">{task.priority} priority</span><span className="task-urgency-label font-medium">{urgency.label}</span>{task.due_date && <span>{displayDate(task.due_date)}</span>}
          {task.opportunity_id && <Link className="underline underline-offset-4" href={`/opportunities?opportunity=${encodeURIComponent(task.opportunity_id)}`}>{names.get(task.opportunity_id) ?? "View opportunity"}</Link>}</div>
        </div><div className="flex flex-wrap gap-2"><button className="tracker-button" disabled={pending} aria-label={`${task.completed_at ? "Reopen" : "Complete"} task: ${task.title}`} onClick={() => startTransition(async () => {
          try { const result = await setTaskCompleted(task.id, !task.completed_at); if (result.saved) { accept(result.saved); setMessage(""); } else setMessage(result.message ?? "Couldn’t update task."); } catch { setMessage("Couldn’t update task. Please try again."); }
        })}>{task.completed_at ? "Reopen" : "Complete"}</button><button className="tracker-button" disabled={pending} onClick={() => edit(task)} aria-label={`Edit task: ${task.title}`}>Edit</button><button className="tracker-button text-destructive" disabled={pending} onClick={() => setConfirming(task.id)} aria-label={`Delete task: ${task.title}`}>Delete</button></div></div>
        {confirming === task.id && <div className="space-y-3 border-t pt-3"><p className="text-sm">Permanently delete this task?</p><div className="flex flex-wrap gap-2"><button className="tracker-button tracker-danger" disabled={pending} onClick={() => startTransition(async () => {
          try { const result = await deleteTask(task.id); if (result.message) { setMessage(result.message); return; } setTasks(current => current.filter(item => item.id !== task.id)); setConfirming(null); if (editingId === task.id) setEditing(false); setMessage(""); } catch { setMessage("Couldn’t delete task. Please try again."); }
        })}>Confirm task deletion</button><button className="tracker-button" disabled={pending} onClick={() => setConfirming(null)}>Cancel deletion</button></div></div>}
      </li>; })}</ul> : <div className="space-y-3 p-8 text-center"><h2 className="font-semibold">{(tasks.length || supplements.length) ? "No tasks match these filters" : "Your next step starts here"}</h2><p className="text-sm text-muted-foreground">{(tasks.length || supplements.length) ? "Adjust your filters or add a task." : "Add research, applications, portfolio work, or another task to your plan."}</p></div>}
    </section>
  </main></div>;
}
