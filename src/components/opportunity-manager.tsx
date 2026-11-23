"use client";

import { useState, useTransition } from "react";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveOpportunity, deleteOpportunity, archiveOpportunity } from "@/app/opportunities/actions";
import { arrangements, displayDate, opportunityTypes, outcomes, priorities, statuses, statusLabel, type Opportunity } from "@/lib/opportunity-model";
import { ActivityLog } from "@/components/activity-log";
import { TrackerHeader } from "@/components/tracker-header";
import type { Task } from "@/lib/task-model";
import { defaultOpportunityFilters, selectOpportunities, type OpportunityFilters } from "@/lib/opportunity-view";

const detailFields = [
  ["contact_name", "Contact name"], ["contact_email", "Contact email"], ["website_url", "Website"], ["application_url", "Application URL"],
  ["location", "Location"], ["work_arrangement", "Work arrangement"], ["technical_focus", "Technical focus / tags"],
  ["deadline", "Application deadline"], ["next_action", "Next action"], ["next_action_date", "Next action date"],
  ["fit_notes", "Why this opportunity is relevant"], ["outreach_notes", "Personalization notes for outreach"], ["notes", "General notes"],
] as const;

export function OpportunityManager({ initialOpportunities, initialTasks, initialSelectedId, lastActivity, today }: { initialOpportunities: Opportunity[]; initialTasks: Task[]; initialSelectedId: string; lastActivity: Record<string, string>; today: string }) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [selected, setSelected] = useState<Opportunity | null>(initialOpportunities.find(item => item.id === initialSelectedId) ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [filters, setFilters] = useState(defaultOpportunityFilters);
  const [view, setView] = useState<"table" | "board">("table");
  const filtered = selectOpportunities(opportunities, filters, today, lastActivity);
  const filter = (key: keyof OpportunityFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  function clearFeedback() { setErrors({}); setMessage(""); setConfirming(false); }
  function showList() { setSelected(null); setEditing(false); clearFeedback(); router.replace("/opportunities"); }
  function edit(item: Opportunity | null) {
    setSelected(item);
    setDraft(Object.fromEntries(Object.entries(item ?? { type: "Research", status: "Saved", priority: "medium", work_arrangement: "unspecified" }).map(([key, value]) => [key, value ?? ""])));
    clearFeedback(); setEditing(true);
  }
  function field(key: string, label: string, options: { type?: string; choices?: readonly string[]; multiline?: boolean; required?: boolean } = {}) {
    const attributes = {
      id: key, name: key, value: draft[key] ?? "", required: options.required,
      "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${key}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft(current => ({ ...current, [key]: event.target.value })),
      className: "tracker-input",
    };
    return <div className={options.multiline ? "sm:col-span-2" : ""} key={key}>
      <label className="mb-2 block text-sm font-medium" htmlFor={key}>{label}{options.required && <span aria-hidden="true"> *</span>}</label>
      {options.choices ? <select {...attributes}>
        {key === "closed_outcome" && <option value="">Unspecified</option>}
        {options.choices.map(value => <option key={value} value={value}>{key === "status" ? statusLabel(value, draft.type) : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
      </select> : options.multiline ? <textarea {...attributes} rows={4} /> : <input {...attributes} type={options.type ?? "text"} />}
      {errors[key] && <p className="mt-2 text-sm text-destructive" id={`${key}-error`}>{errors[key]}</p>}
    </div>;
  }
  const title = editing ? selected ? "Edit opportunity" : "Add opportunity" : selected ? selected.organization_name : "Opportunities";
  return <div className="min-h-svh bg-muted/25">
    <TrackerHeader active="opportunities" />
    <main className={`mx-auto px-5 py-8 sm:px-8 sm:py-10 ${editing ? "max-w-3xl" : "max-w-6xl"}`}>
      {(selected || editing) && <button className="mb-5 text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={showList} disabled={pending}>All opportunities</button>}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 break-words text-muted-foreground">{editing ? "Start with the essentials. Add more details as you research." : selected ? selected.title : "Keep your research contacts, startups, and applications in one place."}</p></div>
        {!editing && <button className="tracker-button tracker-primary" onClick={() => edit(selected)}><Plus className="size-4" aria-hidden="true" />{selected ? "Edit opportunity" : "Add opportunity"}</button>}
      </div>
      {message && <p role="alert" className="mb-5 text-sm text-destructive">{message}</p>}
      {!editing && !selected && <div className="mb-6 space-y-4"><label className="block text-sm font-medium">Search opportunities<input className="tracker-input mt-2" type="search" value={filters.search} placeholder="Organization, contact, title, or focus" onChange={event => filter("search", event.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Opportunity type<select className="tracker-input mt-2" value={filters.type} onChange={event => filter("type", event.target.value)}><option value="">All types</option>{opportunityTypes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-medium">Pipeline status<select className="tracker-input mt-2" value={filters.status} onChange={event => filter("status", event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-medium">Priority<select className="tracker-input mt-2" value={filters.priority} onChange={event => filter("priority", event.target.value)}><option value="">All priorities</option>{priorities.map(value => <option value={value} key={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label className="text-sm font-medium">Deadline<select className="tracker-input mt-2" value={filters.deadline} onChange={event => filter("deadline", event.target.value)}><option value="">All deadlines</option><option value="upcoming">Next seven days</option><option value="overdue">Past deadline</option><option value="none">No deadline</option></select></label>
        <label className="text-sm font-medium">Archive<select className="tracker-input mt-2" value={filters.archive} onChange={event => filter("archive", event.target.value)}><option value="active">Active opportunities</option><option value="archived">Archived opportunities</option><option value="all">All opportunities</option></select></label>
        <label className="text-sm font-medium">Sort by<select className="tracker-input mt-2" value={filters.sort} onChange={event => filter("sort", event.target.value)}><option value="newest">Newest saved</option><option value="status">Pipeline status</option><option value="type">Opportunity type</option><option value="priority">Priority</option><option value="deadline">Deadline</option><option value="last_activity">Last recorded activity</option></select></label>
      </div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="group" aria-label="Opportunity view"><button className={`tracker-button ${view === "table" ? "tracker-primary" : ""}`} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button><button className={`tracker-button ${view === "board" ? "tracker-primary" : ""}`} aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button></div><button className="tracker-button" onClick={() => setFilters(defaultOpportunityFilters)}>Reset filters</button></div></div>}
      {editing ? <form onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            const result = await saveOpportunity(selected?.id ?? null, form);
            if (!result.saved) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Couldn’t save this opportunity."); return; }
            const saved = result.saved;
            setOpportunities(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
            setSelected(saved); setEditing(false); clearFeedback();
          } catch { setMessage("Couldn’t reach the app. Your entries are still here; please try again."); }
        });
      }} className="space-y-6">
        <fieldset disabled={pending} className="tracker-panel grid gap-5 p-6 sm:grid-cols-2"><legend className="sr-only">Opportunity details</legend>
          {field("organization_name", "Organization / university", { required: true })}{field("title", "Title / research focus", { required: true })}
          {field("type", "Opportunity type", { required: true, choices: opportunityTypes })}{field("status", "Pipeline status", { required: true, choices: statuses })}
          {field("priority", "Priority", { choices: priorities })}{field("deadline", "Application deadline", { type: "date" })}
          {draft.status === "Closed" && field("closed_outcome", "Closed outcome", { choices: outcomes })}
        </fieldset>
        <fieldset disabled={pending} className="tracker-panel space-y-5 p-6"><legend className="sr-only">Optional contact and planning details</legend>
          <h2 className="text-lg font-semibold">Contact and planning</h2><p className="text-sm text-muted-foreground">Optional details to help prepare your next step.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {detailFields.filter(([key]) => key !== "deadline").map(([key, label]) => field(key, label, {
              type: key === "contact_email" ? "email" : key.endsWith("_url") ? "url" : key === "next_action_date" ? "date" : "text",
              choices: key === "work_arrangement" ? arrangements : undefined,
              multiline: ["fit_notes", "outreach_notes", "notes", "next_action"].includes(key),
            }))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3"><button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : selected ? "Save changes" : "Add opportunity"}</button><button type="button" className="tracker-button" disabled={pending} onClick={() => { setEditing(false); clearFeedback(); }}>Cancel</button></div>
      </form> : selected ? <>
        <div className="mb-5 flex flex-wrap items-center gap-3">{selected.archived_at && <span className="tracker-badge">Archived</span>}<button className="tracker-button" disabled={pending} onClick={() => startTransition(async () => { try {
          const result = await archiveOpportunity(selected.id, !selected.archived_at);
          if (!result.saved) { setMessage(result.message ?? "Couldn’t update archive state."); return; }
          const saved = result.saved; setOpportunities(current => current.map(item => item.id === saved.id ? saved : item)); setSelected(saved); setMessage("");
        } catch { setMessage("Couldn’t update archive state. Please try again."); } })}>{selected.archived_at ? "Restore opportunity" : "Archive opportunity"}</button></div>
        <dl className="tracker-panel grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2">
          {([["type", "Type"], ["status", "Status"], ["priority", "Priority"], ...(selected.closed_outcome ? [["closed_outcome", "Closed outcome"]] : []), ...detailFields] as [keyof Opportunity, string][]).map(([key, label]) => {
            const value = key === "status" ? statusLabel(selected.status, selected.type) : key === "deadline" || key === "next_action_date" ? displayDate(selected[key]) : selected[key];
            return <div className="min-w-0" key={key}><dt className="text-sm font-medium text-muted-foreground">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words">{value && key.endsWith("_url") ? <a className="underline underline-offset-4" href={value} target="_blank" rel="noreferrer">{value}</a> : value || "—"}</dd></div>;
          })}
        </dl>
        <ActivityLog key={selected.id} opportunity={selected} onUpdated={saved => {
          setOpportunities(current => current.map(item => item.id === saved.id ? saved : item));
          setSelected(current => current?.id === saved.id ? saved : current);
        }} />
        <section className="tracker-panel mt-7 space-y-4 p-6" aria-labelledby="linked-tasks-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="linked-tasks-heading" className="text-lg font-semibold">Linked tasks</h2><Link className="tracker-button" href={`/tasks?opportunity=${selected.id}&new=1`}>Add linked task</Link></div>
          {initialTasks.some(task => task.opportunity_id === selected.id) ? <ul className="divide-y">{initialTasks.filter(task => task.opportunity_id === selected.id).map(task => <li key={task.id} className="flex flex-wrap justify-between gap-3 py-3"><Link className="underline underline-offset-4" href={`/tasks?task=${task.id}#task-${task.id}`}>{task.title}</Link><span className="text-sm text-muted-foreground">{task.completed_at ? "Completed" : task.due_date ? displayDate(task.due_date) : "No due date"}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No tasks linked to this opportunity yet.</p>}
        </section>
        <section className="mt-8 border-t pt-6" aria-label="Delete opportunity">
          {confirming ? <div className="space-y-3"><h2 className="font-semibold">Delete {selected.organization_name}?</h2><p className="text-sm text-muted-foreground">This permanently deletes this opportunity, its saved details, and its activity history. Linked tasks will be kept as standalone tasks.</p><div className="flex flex-wrap gap-3">
            <button className="tracker-button tracker-danger" disabled={pending} onClick={() => startTransition(async () => {
              try {
                const result = await deleteOpportunity(selected.id);
                if (result.message) { setMessage(result.message); return; }
                setOpportunities(current => current.filter(item => item.id !== selected.id)); showList();
              } catch { setMessage("Couldn’t delete this opportunity. Please try again."); }
            })}>{pending ? "Deleting…" : "Confirm deletion"}</button><button className="tracker-button" disabled={pending} onClick={() => setConfirming(false)}>Cancel deletion</button>
          </div></div> : <button className="tracker-button text-destructive" onClick={() => setConfirming(true)}>Delete opportunity</button>}
        </section>
      </> : <div className="tracker-panel overflow-hidden">
        <div className="border-b px-5 py-4 text-sm font-medium">{filtered.length} of {opportunities.length} {opportunities.length === 1 ? "opportunity" : "opportunities"}</div>
        {filtered.length ? view === "board" ? <div className="overflow-x-auto"><div className="grid grid-flow-col auto-cols-[250px] gap-4 p-5">{statuses.map(status => <section key={status} className="space-y-3" aria-label={status}><h2 className="text-sm font-semibold">{status} · {filtered.filter(item => item.status === status).length}</h2>{filtered.filter(item => item.status === status).map(item => <button key={item.id} className="tracker-panel w-full space-y-2 p-4 text-left hover:bg-muted/30" onClick={() => { setSelected(item); clearFeedback(); }}><span className="block break-words font-medium">{item.organization_name}</span><span className="block break-words text-sm text-muted-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.type} · {statusLabel(item.status, item.type)}</span><span className="block text-xs capitalize">{item.priority} priority{item.deadline ? ` · ${displayDate(item.deadline)}` : ""}</span></button>)}</section>)}</div></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Saved opportunities matching your filters</caption><thead className="bg-muted/40 text-muted-foreground"><tr>{["Opportunity", "Type", "Status", "Priority", "Deadline"].map(label => <th scope="col" key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-t"><td className="min-w-56 px-5 py-4"><button className="text-left font-medium underline-offset-4 hover:underline" onClick={() => { setSelected(item); clearFeedback(); }}>{item.organization_name}</button><p className="mt-1 text-muted-foreground">{item.title}</p></td><td className="px-5 py-4">{item.type}</td><td className="px-5 py-4"><span className="tracker-badge">{statusLabel(item.status, item.type)}</span></td><td className="px-5 py-4 capitalize">{item.priority}</td><td className="whitespace-nowrap px-5 py-4">{displayDate(item.deadline)}</td></tr>)}</tbody></table></div> : <div className="flex flex-col items-center gap-4 px-6 py-16 text-center"><FolderOpen className="size-9 text-muted-foreground" aria-hidden="true" /><h2 className="text-lg font-semibold">{opportunities.length ? "No opportunities match these filters" : "Your next opportunity starts here"}</h2><p className="max-w-md text-muted-foreground">{opportunities.length ? "Adjust your search or filters, or add a new opportunity." : "Save a professor, startup, or internship so you can track the details and decide what to do next."}</p><button className="tracker-button" onClick={() => edit(null)}>Add opportunity</button></div>}
      </div>}
    </main>
  </div>;
}
