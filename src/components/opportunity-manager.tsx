"use client";

import { useState, useTransition } from "react";
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

export function OpportunityManager({ initialOpportunities, initialTasks, initialSelectedId, lastActivity, today, followUpDays }: { initialOpportunities: Opportunity[]; initialTasks: Task[]; initialSelectedId: string; lastActivity: Record<string, string>; today: string; followUpDays: number }) {
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
      autoFocus: key === "organization_name",
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
  return <div className="min-h-svh">
    <TrackerHeader active="opportunities" />
    <main className={`mx-auto px-5 py-8 sm:px-8 sm:py-10 ${editing ? "max-w-3xl" : "max-w-6xl"}`}>
      {(selected || editing) && <button className="mb-5 text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={showList} disabled={pending}>All opportunities</button>}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 break-words text-muted-foreground">{editing ? "Start with the essentials. Add more details as you research." : selected ? selected.title : "Keep your research contacts, startups, and applications in one place."}</p></div>
        {!editing && <button className="tracker-button tracker-primary" onClick={() => edit(selected)}>{selected ? "Edit opportunity" : "Add opportunity"}</button>}
      </div>
      {message && <p role="alert" className="mb-5 text-sm text-destructive">{message}</p>}
      {!editing && !selected && <div className="tracker-panel mb-6 space-y-4 p-5"><label className="block text-sm font-medium">Search opportunities<input className="tracker-input mt-2" type="search" value={filters.search} placeholder="Organization, contact, title, or focus" onChange={event => filter("search", event.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <fieldset disabled={pending} className="tracker-panel grid gap-5 p-6 sm:grid-cols-2"><legend className="sr-only">Opportunity details</legend><div className="sm:col-span-2"><h2 className="text-lg font-semibold">The essentials</h2><p className="mt-1 text-sm text-muted-foreground">Save an opportunity now. Fill in the rest as you go.</p></div>
          {field("organization_name", "Organization / university", { required: true })}{field("title", "Title / research focus", { required: true })}
          {field("type", "Opportunity type", { required: true, choices: opportunityTypes })}{field("status", "Pipeline status", { required: true, choices: statuses })}
          {field("priority", "Priority", { choices: priorities })}{field("deadline", "Application deadline", { type: "date" })}
          {draft.status === "Closed" && field("closed_outcome", "Closed outcome", { choices: outcomes })}
        </fieldset>
        <details className="tracker-panel p-6" open={Boolean(selected) || detailFields.some(([key]) => key !== "deadline" && Boolean(errors[key])) || undefined}><summary className="cursor-pointer text-lg font-semibold">Contact, planning, and notes <span className="ml-2 text-sm font-normal text-muted-foreground">Optional</span></summary><fieldset disabled={pending} className="mt-5 space-y-5"><legend className="sr-only">Optional contact and planning details</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {detailFields.filter(([key]) => key !== "deadline").map(([key, label]) => field(key, label, {
              type: key === "contact_email" ? "email" : key.endsWith("_url") ? "url" : key === "next_action_date" ? "date" : "text",
              choices: key === "work_arrangement" ? arrangements : undefined,
              multiline: ["fit_notes", "outreach_notes", "notes", "next_action"].includes(key),
            }))}
          </div>
        </fieldset></details>
        <div className="tracker-panel sticky bottom-4 z-30 flex flex-wrap gap-3 p-3"><button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : selected ? "Save changes" : "Add opportunity"}</button><button type="button" className="tracker-button" disabled={pending} onClick={() => { setEditing(false); clearFeedback(); }}>Cancel</button></div>
      </form> : selected ? <>
        <div className="mb-6 flex flex-wrap gap-2"><span className="tracker-badge">{selected.type}</span><span className="tracker-badge text-primary">{statusLabel(selected.status, selected.type)}</span><span className="tracker-badge capitalize">{selected.priority} priority</span>{selected.closed_outcome && <span className="tracker-badge">{selected.closed_outcome}</span>}{selected.archived_at && <span className="tracker-badge">Archived</span>}</div>
        <section className="tracker-panel mb-7 grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_auto]" aria-labelledby="next-step-heading">
          <div><h2 id="next-step-heading" className="tracker-eyebrow">Next step</h2><p className="mt-3 whitespace-pre-wrap break-words text-lg font-medium">{selected.next_action || "No next action planned"}</p><p className="mt-2 text-sm text-muted-foreground">{selected.next_action_date ? `Planned for ${displayDate(selected.next_action_date)}` : "Set a next action when you edit this opportunity."}</p></div>
          <div className="sm:border-l sm:pl-6"><h3 className="tracker-eyebrow">Application deadline</h3><p className="mt-3 text-lg font-medium">{selected.deadline ? displayDate(selected.deadline) : "No deadline set"}</p></div>
        </section>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"><div className="min-w-0">
        <ActivityLog key={selected.id} opportunity={selected} followUpDays={followUpDays} onUpdated={saved => {
          setOpportunities(current => current.map(item => item.id === saved.id ? saved : item));
          setSelected(current => current?.id === saved.id ? saved : current);
        }} />
        <section className="tracker-panel mt-7 space-y-4 p-6" aria-labelledby="linked-tasks-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="linked-tasks-heading" className="text-lg font-semibold">Linked tasks</h2><Link className="tracker-button" href={`/tasks?opportunity=${selected.id}&new=1`}>Add linked task</Link></div>
          {initialTasks.some(task => task.opportunity_id === selected.id) ? <ul className="divide-y">{initialTasks.filter(task => task.opportunity_id === selected.id).map(task => <li key={task.id} className="flex flex-wrap justify-between gap-3 py-3"><Link className="underline underline-offset-4" href={`/tasks?task=${task.id}#task-${task.id}`}>{task.title}</Link><span className="text-sm text-muted-foreground">{task.completed_at ? "Completed" : task.due_date ? displayDate(task.due_date) : "No due date"}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No tasks linked to this opportunity yet.</p>}
        </section>
        </div><aside className="min-w-0 space-y-6" aria-label="Opportunity context">
          <section className="tracker-panel space-y-5 p-6"><h2 className="text-lg font-semibold">Contact and links</h2><dl className="space-y-4">
            {([["contact_name", "Contact"], ["contact_email", "Email"], ["website_url", "Website"], ["application_url", "Application"], ["location", "Location"], ["work_arrangement", "Work arrangement"], ["technical_focus", "Technical focus"]] as const).filter(([key]) => selected[key] && selected[key] !== "unspecified").map(([key, label]) => <div key={key}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{key.endsWith("_url") ? <a className="text-primary underline underline-offset-4" href={selected[key]!} target="_blank" rel="noreferrer">{selected[key]}</a> : key === "contact_email" ? <a className="text-primary underline underline-offset-4" href={`mailto:${selected[key]}`}>{selected[key]}</a> : selected[key]}</dd></div>)}
          </dl>{![selected.contact_name, selected.contact_email, selected.website_url, selected.application_url, selected.location, selected.technical_focus, selected.work_arrangement !== "unspecified"].some(Boolean) && <p className="text-sm text-muted-foreground">Add a contact or link when you research this opportunity.</p>}</section>
          <section className="tracker-panel space-y-5 p-6"><h2 className="text-lg font-semibold">Research and notes</h2>{([["fit_notes", "Why it fits"], ["outreach_notes", "Outreach preparation"], ["notes", "General notes"]] as const).filter(([key]) => selected[key]).map(([key, label]) => <div key={key}><h3 className="text-sm font-medium text-muted-foreground">{label}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{selected[key]}</p></div>)}{![selected.fit_notes, selected.outreach_notes, selected.notes].some(Boolean) && <p className="text-sm text-muted-foreground">Keep fit notes, outreach preparation, and other research here.</p>}</section>
        </aside></div>
        <div className="mt-6 flex flex-wrap items-center gap-3"><button className="tracker-button" disabled={pending} onClick={() => startTransition(async () => { try {
          const result = await archiveOpportunity(selected.id, !selected.archived_at);
          if (!result.saved) { setMessage(result.message ?? "Couldn’t update archive state."); return; }
          const saved = result.saved; setOpportunities(current => current.map(item => item.id === saved.id ? saved : item)); setSelected(saved); setMessage("");
        } catch { setMessage("Couldn’t update archive state. Please try again."); } })}>{selected.archived_at ? "Restore opportunity" : "Archive opportunity"}</button></div>
        <section className="mt-5 border-t pt-5" aria-label="Delete opportunity">
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
        {filtered.length ? view === "board" ? <div className="overflow-x-auto"><div className="grid grid-flow-col auto-cols-[250px] gap-4 p-5">{statuses.map(status => <section key={status} className="space-y-3" aria-label={status}><h2 className="text-sm font-semibold">{status} · {filtered.filter(item => item.status === status).length}</h2>{filtered.filter(item => item.status === status).map(item => <button key={item.id} className="tracker-panel w-full space-y-2 p-4 text-left hover:bg-muted/30" onClick={() => { setSelected(item); clearFeedback(); }}><span className="block break-words font-medium">{item.organization_name}</span><span className="block break-words text-sm text-muted-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.type} · {statusLabel(item.status, item.type)}</span><span className="block text-xs capitalize">{item.priority} priority{item.deadline ? ` · ${displayDate(item.deadline)}` : ""}</span></button>)}</section>)}</div></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Saved opportunities matching your filters</caption><thead className="bg-muted/40 text-muted-foreground"><tr>{["Opportunity", "Type", "Status", "Priority", "Deadline"].map(label => <th scope="col" key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-t transition-colors hover:bg-muted/50"><td className="min-w-56 px-5 py-4"><button className="text-left font-medium underline-offset-4 hover:underline" onClick={() => { setSelected(item); clearFeedback(); }}>{item.organization_name}</button><p className="mt-1 text-muted-foreground">{item.title}</p></td><td className="px-5 py-4">{item.type}</td><td className="px-5 py-4"><span className="tracker-badge">{statusLabel(item.status, item.type)}</span></td><td className="px-5 py-4 capitalize">{item.priority}</td><td className="whitespace-nowrap px-5 py-4">{displayDate(item.deadline)}</td></tr>)}</tbody></table></div> : <div className="flex flex-col items-center gap-4 px-6 py-16 text-center"><h2 className="text-lg font-semibold">{opportunities.length ? "No opportunities match these filters" : "Your next opportunity starts here"}</h2><p className="max-w-md text-muted-foreground">{opportunities.length ? "Adjust your search or filters, or add a new opportunity." : "Save a professor, startup, or internship so you can track the details and decide what to do next."}</p><button className="tracker-button" onClick={() => edit(null)}>Add opportunity</button></div>}
      </div>}
    </main>
  </div>;
}
