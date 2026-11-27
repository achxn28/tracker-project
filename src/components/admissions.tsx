"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { confirmAdmissionsImport, saveApplication, saveEssay } from "@/app/admissions/actions";
import { QueueControls } from "@/components/queue-controls";
import { collegeHref, supplementStatuses, ucCampusIds, type AdmissionsData, type College, type Supplement, type SupplementStatus } from "@/lib/admissions-model";
import { displayDate } from "@/lib/opportunity-model";

type Save = (form: FormData) => Promise<string | void>;

function Editor({ children, save, button, reset }: { children?: ReactNode; save: Save; button: string; reset?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    startTransition(async () => {
      const error = await save(values);
      setMessage(error || "Saved.");
      if (!error && reset) form.reset();
    });
  }

  return <form className="space-y-3" onSubmit={submit}>
    {children}
    <div className="flex flex-wrap items-center gap-3">
      <button className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : button}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  </form>;
}

function SchoolFields({ college }: { college?: College }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">School<input className="tracker-input" name="name" required defaultValue={college?.name} /></label>
      <label className="space-y-1 text-sm">Application round<input className="tracker-input" name="round" defaultValue={college?.round} placeholder="e.g. RD" /></label>
      <label className="space-y-1 text-sm">Application deadline<input className="tracker-input" name="deadline" type="date" defaultValue={college?.deadline ?? ""} /></label>
    </div>
    <label className="block space-y-1 text-sm">Google Docs link<input className="tracker-input" name="docsUrl" type="url" defaultValue={college?.docsUrl ?? ""} /></label>
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" name="submitted" defaultChecked={college?.submitted} /> Application submitted</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="supplementsUnknown" defaultChecked={college?.supplementsUnknown} /> Verify supplement requirements</label>
    </div>
  </>;
}

function EssayFields({ essay }: { essay?: Supplement }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Title<input className="tracker-input" name="title" required defaultValue={essay?.title} /></label>
      <label className="space-y-1 text-sm">Status<select className="tracker-input" name="status" defaultValue={essay?.status}>{supplementStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
      <label className="space-y-1 text-sm">Writing deadline<input className="tracker-input" type="date" name="dueDate" defaultValue={essay?.dueDate ?? ""} /></label>
      <label className="space-y-1 text-sm">Word limit<input className="tracker-input" type="number" name="wordLimit" min="1" defaultValue={essay?.wordLimit ?? ""} /></label>
    </div>
    <label className="block space-y-1 text-sm">Prompt<textarea className="tracker-input min-h-24" name="prompt" defaultValue={essay?.prompt ?? ""} /></label>
    <label className="block space-y-1 text-sm">Google Docs link<input className="tracker-input" type="url" name="docsUrl" defaultValue={essay?.docsUrl ?? ""} /></label>
  </>;
}

function importSummary(preview: AdmissionsData, data: AdmissionsData) {
  const colleges = [...data.colleges, ...preview.colleges];
  return colleges.map(college => ({
    college,
    essays: preview.supplements.filter(essay => essay.collegeId === college.id),
  })).filter(({ college, essays }) => essays.length || preview.colleges.some(item => item.id === college.id));
}

export function Admissions({ data, preview, selectedCollege }: { data: AdmissionsData; preview: AdmissionsData | null; selectedCollege?: string }) {
  const [status, setStatus] = useState<SupplementStatus | "All">("All");
  const [school, setSchool] = useState(selectedCollege ?? "");
  const [collapseOverrides, setCollapseOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  function setSchoolCollapsed(id: string, collapsed: boolean) {
    setCollapseOverrides(current => new Map(current).set(id, collapsed));
  }
  const visible = school ? data.colleges.filter(item => item.id === school || item.id === "uc-piqs" && ucCampusIds.includes(school)) : data.colleges;
  const essays = data.supplements.filter(item => visible.some(college => college.id === item.collegeId));
  const completedSchools = new Set(visible.filter(college => {
    if (college.submitted) return true;
    const sharesUcEssays = ucCampusIds.includes(college.id);
    const writing = essays.filter(essay => essay.collegeId === college.id || (sharesUcEssays && essay.collegeId === "uc-piqs"));
    return writing.length > 0 && writing.every(essay => essay.status === "Done");
  }).map(college => college.id));

  function isCollapsed(id: string) {
    return completedSchools.has(id) && (collapseOverrides.get(id) ?? (id !== selectedCollege));
  }

  return <>
    {preview && (preview.colleges.length > 0 || preview.supplements.length > 0) && <details className="tracker-panel space-y-4 p-5" open={data.colleges.length === 0}>
      <summary className="cursor-pointer font-semibold">Review import · {preview.colleges.length} entries · {preview.supplements.length} supplements</summary>
      <p className="text-sm text-muted-foreground">Application dates come from your list. Writing dates are suggested targets. Check the entries marked Done in Docs and verify missing prompts or requirements.</p>
      <ul className="max-h-96 space-y-3 overflow-y-auto divide-y">
        {importSummary(preview, data).map(({ college, essays }) => <li className="space-y-1 py-2" key={college.id}>
          <p className="font-medium">{college.name} · {college.deadline ? displayDate(college.deadline) : "No application date"}{college.supplementsUnknown ? " · Verify requirements" : ""}</p>
          {essays.map(essay => <p className="text-sm text-muted-foreground" key={essay.id}>{essay.title} · {essay.status}{essay.dueDate ? ` · ${displayDate(essay.dueDate)}` : ""}{essay.prompt ? "" : " · Prompt missing"}</p>)}
        </li>)}
      </ul>
      <Editor save={confirmAdmissionsImport} button="Import list" />
    </details>}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="space-y-1 text-sm">Filter by status
        <select className="tracker-input" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
          <option value="All">All supplements ({essays.length})</option>
          {supplementStatuses.map(value => <option key={value} value={value}>{value} ({essays.filter(essay => essay.status === value).length})</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm">School
        <select className="tracker-input" value={school} onChange={event => setSchool(event.target.value)}>
          <option value="">All schools</option>
          {data.colleges.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </div>

    {status !== "All" && <section className="tracker-panel space-y-3 p-5" aria-label={status}>
      <h2 className="font-semibold">{status} by writing deadline</h2>
      <ul className="space-y-2 text-sm">
        {essays.filter(essay => essay.status === status).map(essay => <li key={essay.id}>
          <a className="text-primary underline-offset-4 hover:underline" href={`#supplement-${essay.id}`} onClick={() => {
            if (isCollapsed(essay.collegeId)) flushSync(() => setSchoolCollapsed(essay.collegeId, false));
          }}>{visible.find(college => college.id === essay.collegeId)?.name} · {essay.title}</a>
          <span className="ml-2 text-muted-foreground">{essay.dueDate ? displayDate(essay.dueDate) : "Unscheduled"}</span>
        </li>)}
        {!essays.some(essay => essay.status === status) && <li className="text-muted-foreground">No essays in this status.</li>}
      </ul>
    </section>}

    <details className="tracker-panel space-y-4 p-5">
      <summary className="cursor-pointer font-semibold">Add school</summary>
      <Editor save={saveApplication.bind(null, null)} reset button="Add school"><SchoolFields /></Editor>
    </details>

    {visible.map(college => {
      const all = essays.filter(essay => essay.collegeId === college.id);
      const items = status === "All" ? all : all.filter(essay => essay.status === status);
      if (status !== "All" && !items.length) return null;
      const canCollapse = completedSchools.has(college.id);
      const collapsed = isCollapsed(college.id);
      const detailsId = `college-details-${college.id}`;
      const Chevron = collapsed ? ChevronRight : ChevronDown;

      return <section className="tracker-panel scroll-mt-5 overflow-hidden" key={college.id} id={`college-${college.id}`}>
        <h2 className="text-xl font-semibold">
          {canCollapse ? <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 pt-4 pb-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2"
            aria-expanded={!collapsed}
            aria-controls={detailsId}
            onClick={() => setSchoolCollapsed(college.id, !collapsed)}
          >
            <span>{college.name}</span>
            <Chevron aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button> : <span className="block px-5 pt-5">{college.name}</span>}
        </h2>
        <div id={detailsId} hidden={collapsed} className="divide-y">
          <header className="space-y-2 px-5 pt-2 pb-5">
            <p className="text-sm text-muted-foreground">{[college.round, college.deadline ? `Application due ${displayDate(college.deadline)}` : college.id !== "uc-piqs" && "Application date missing", college.submitted && "Submitted", `${all.filter(essay => essay.status === "Done").length}/${all.length} done`].filter(Boolean).join(" · ")}</p>
            {college.supplementsUnknown && <p className="text-sm text-muted-foreground">Verify supplement requirements</p>}
            {ucCampusIds.includes(college.id) && <Link href={collegeHref("uc-piqs")} className="text-sm text-primary underline-offset-4 hover:underline">Shared UC PIQs</Link>}
            <div className="flex flex-wrap items-start gap-4">
              {college.docsUrl && <a href={college.docsUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">Open school Docs tab</a>}
              <details className="min-w-0 flex-1 space-y-3">
                <summary className="cursor-pointer text-sm">Edit school</summary>
                <Editor save={saveApplication.bind(null, college.id)} button="Save school"><SchoolFields college={college} /></Editor>
              </details>
            </div>
          </header>

          {items.map(essay => <article key={essay.id} id={`supplement-${essay.id}`} className="scroll-mt-5 space-y-2 p-5 target:bg-primary/10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{essay.title}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tracker-badge">{essay.status}</span>
                {essay.status !== "Done" && <QueueControls item={{
                  id: essay.id, kind: "supplement", title: essay.title, date: essay.dueDate, context: college.name,
                }} />}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{[essay.dueDate ? `Writing due ${displayDate(essay.dueDate)}` : "No writing deadline", essay.wordLimit && `${essay.wordLimit} words max`, !essay.prompt && "Prompt missing"].filter(Boolean).join(" · ")}</p>
            {essay.prompt && <details className="space-y-2 text-sm"><summary className="cursor-pointer">Read prompt</summary><p className="whitespace-pre-wrap">{essay.prompt}</p></details>}
            <div className="flex flex-wrap items-start gap-4">
              {(essay.docsUrl || college.docsUrl) && <a href={essay.docsUrl ?? college.docsUrl!} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">Open in Docs</a>}
              <details className="min-w-0 flex-1 space-y-3">
                <summary className="cursor-pointer text-sm">Edit supplement</summary>
                <Editor save={saveEssay.bind(null, essay.id, college.id)} button="Save supplement"><EssayFields essay={essay} /></Editor>
              </details>
            </div>
          </article>)}
          <details className="space-y-3 p-5">
            <summary className="cursor-pointer text-sm font-medium">Add supplement</summary>
            <Editor save={saveEssay.bind(null, null, college.id)} reset button="Add supplement"><EssayFields /></Editor>
          </details>
        </div>
      </section>;
    })}
  </>;
}
