"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrackerHeader } from "@/components/tracker-header";
import { deleteGoal, saveGoal } from "@/app/goals/actions";
import { admissionsGoalId, admissionsGoalLabel, goalMetrics, goalTemplates, type GoalView } from "@/lib/goal-model";
import { displayDate } from "@/lib/opportunity-model";

type GoalDraft = Pick<GoalView, "title" | "metric_type" | "target_count" | "status" | "start_date" | "end_date">;

export function GoalManager({ initialGoals, today, focus }: { initialGoals: GoalView[]; today: string; focus: string }) {
  const [goals, setGoals] = useState(initialGoals);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(goalTemplates(today)[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const templates = goalTemplates(today);
  const usesAllSupplements = draft.metric_type === "all_supplements";
  const canSetAdmissionsGoal = editId === admissionsGoalId || (!editId && !goals.some(goal => goal.id === admissionsGoalId));
  const status = (goal: GoalView) => goal.status === "paused" ? "Paused" : goal.completed ? "Completed" : "Active";
  const visible = goals.filter(goal => !filter || status(goal).toLowerCase() === filter).sort((a, b) => a.end_date.localeCompare(b.end_date));
  function edit(goal: GoalView | null) { setDraft(goal ?? { ...templates[0], title: "" }); setEditId(goal?.id ?? null); setEditing(true); setErrors({}); setMessage(""); }
  const error = (key: string) => errors[key] ? <p className="mt-2 text-sm text-destructive" id={`goal-${key}-error`}>{errors[key]}</p> : null;
  return <div className="min-h-svh"><TrackerHeader active="goals" /><main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Goals</h1><p className="mt-2 text-muted-foreground">Measure progress from what you have actually recorded.</p></div>{!editing && <button className="tracker-button tracker-primary" onClick={() => edit(null)}>Add goal</button>}</div>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {editing && <form className="tracker-panel space-y-5 p-6" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      startTransition(async () => { try {
        const result = await saveGoal(editId, form);
        if (!result.saved) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Check the highlighted fields."); return; }
        const saved = result.saved; setGoals(current => current.some(goal => goal.id === saved.id) ? current.map(goal => goal.id === saved.id ? saved : goal) : [...current, saved]);
        setEditing(false); setMessage(""); setErrors({}); setFilter(""); router.replace(`/goals?goal=${saved.id}#goal-${saved.id}`);
      } catch { setMessage("Couldn’t reach the app. Your entries are still here; please try again."); } });
    }}><h2 className="text-lg font-semibold">{editId ? "Edit goal" : "Add goal"}</h2>
      {!editId && <label className="block max-w-md text-sm font-medium">Start from a template<select className="tracker-input mt-2" defaultValue="" onChange={event => { if (event.target.value !== "") setDraft(templates[Number(event.target.value)]); }}><option value="">Custom goal</option>{templates.map((template, index) => <option key={template.title} value={index}>{template.title} · {template.target_count}</option>)}</select></label>}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2"><legend className="sr-only">Goal details</legend>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="goal-title">Title</label><input className="tracker-input" id="goal-title" name="title" required value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "goal-title-error" : undefined} />{error("title")}</div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="goal-metric">Metric</label><select className="tracker-input" id="goal-metric" name="metric_type" disabled={editId === admissionsGoalId} value={draft.metric_type} onChange={event => setDraft(current => ({ ...current, metric_type: event.target.value as GoalDraft["metric_type"] }))}>{Object.entries(goalMetrics).map(([key, label]) => <option value={key} key={key}>{label}</option>)}{canSetAdmissionsGoal && <option value="all_supplements">{admissionsGoalLabel}</option>}</select>{error("metric_type")}</div>
        {!usesAllSupplements && <div><label className="mb-2 block text-sm font-medium" htmlFor="goal-target">Target</label><input className="tracker-input" id="goal-target" name="target_count" type="number" min={1} step={1} required value={draft.target_count || ""} onChange={event => setDraft(current => ({ ...current, target_count: Number(event.target.value) }))} aria-invalid={Boolean(errors.target_count)} aria-describedby={errors.target_count ? "goal-target_count-error" : undefined} />{error("target_count")}</div>}
        <div><label className="mb-2 block text-sm font-medium" htmlFor="goal-status">Status</label><select className="tracker-input" id="goal-status" name="status" value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value as GoalDraft["status"] }))}><option value="active">Active</option><option value="paused">Paused</option></select>{error("status")}</div>
        {(["start_date", "end_date"] as const).map(key => <div key={key}><label className="mb-2 block text-sm font-medium" htmlFor={`goal-${key}`}>{key === "start_date" ? "Start date" : "Deadline"}</label><input className="tracker-input" id={`goal-${key}`} name={key} type="date" required value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `goal-${key}-error` : undefined} />{error(key)}</div>)}
      </fieldset><p className="text-sm text-muted-foreground">{usesAllSupplements ? "The target updates automatically as you add supplements in Admissions." : "Progress is calculated automatically. Weekly templates use Monday through Sunday."}</p><div className="flex flex-wrap gap-3"><button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : "Save goal"}</button><button type="button" className="tracker-button" disabled={pending} onClick={() => { setEditing(false); setMessage(""); }}>Cancel goal</button></div>
    </form>}
    <label className="block max-w-xs text-sm font-medium">Show goals<select className="tracker-input mt-2" value={filter} onChange={event => setFilter(event.target.value)}><option value="">All goals</option><option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option></select></label>
    <div className="grid gap-5 md:grid-cols-2">{visible.map(goal => <section key={goal.id} id={`goal-${goal.id}`} className={`tracker-panel scroll-mt-5 space-y-4 p-6 ${focus === goal.id ? "ring-2 ring-primary/30" : ""}`}><div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{goal.title}</h2><span className="tracker-badge">{status(goal)}</span></div><p className="text-sm text-muted-foreground">{goal.metric_type === "all_supplements" ? admissionsGoalLabel : goalMetrics[goal.metric_type]}</p><p className="text-2xl font-semibold tabular-nums">{goal.current} <span className="text-sm font-normal text-muted-foreground">of {goal.target_count}</span></p><div className="h-2 overflow-hidden rounded-none bg-muted" role="progressbar" aria-label={goal.title} aria-valuemin={0} aria-valuemax={Math.max(1, goal.target_count)} aria-valuenow={Math.min(goal.current, goal.target_count)}><div className="h-full bg-primary" style={{ width: `${goal.percentage}%` }} /></div><p className="text-sm text-muted-foreground">{displayDate(goal.start_date)} – {displayDate(goal.end_date)}</p><div className="flex flex-wrap gap-2"><button className="tracker-button" disabled={pending} onClick={() => edit(goal)}>Edit goal</button><button className="tracker-button text-destructive" disabled={pending} onClick={() => setConfirming(goal.id)}>Delete goal</button></div>
      {confirming === goal.id && <div className="space-y-3 border-t pt-3"><p className="text-sm">Delete this goal? Your activities and tasks will be kept.</p><div className="flex flex-wrap gap-2"><button className="tracker-button tracker-danger" disabled={pending} onClick={() => startTransition(async () => { try { const result = await deleteGoal(goal.id); if (result.message) { setMessage(result.message); return; } setGoals(current => current.filter(item => item.id !== goal.id)); setConfirming(null); } catch { setMessage("Couldn’t delete this goal. Please try again."); } })}>Confirm goal deletion</button><button className="tracker-button" disabled={pending} onClick={() => setConfirming(null)}>Cancel deletion</button></div></div>}
    </section>)}</div>
    {!visible.length && <div className="tracker-panel space-y-3 p-8 text-center"><h2 className="font-semibold">{goals.length ? "No goals match this filter" : "Set your first goal"}</h2><p className="text-sm text-muted-foreground">Choose a recruiting target or use an editable weekly template.</p></div>}
  </main></div>;
}
