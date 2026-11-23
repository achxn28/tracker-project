"use client";

import { useEffect, useState, useTransition } from "react";
import { getActivities, logActivity } from "@/app/opportunities/actions";
import { activityTypes, displayActivityTime, isOutreach, newYorkInput, suggestedFollowUp, type Activity, type ActivityType } from "@/lib/activity-model";
import type { Opportunity } from "@/lib/opportunity-model";

export function ActivityLog({ opportunity, onUpdated, followUpDays = 7 }: { opportunity: Opportunity; onUpdated: (saved: Opportunity) => void; followUpDays?: number }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ActivityType>(opportunity.type === "Formal Internship" ? "Application submitted" : "Initial email sent");
  const [when, setWhen] = useState(() => newYorkInput());
  const [notes, setNotes] = useState("");
  const [positive, setPositive] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();
  const id = opportunity.id;
  const followUp = customDate ?? suggestedFollowUp(when, followUpDays);

  useEffect(() => {
    let active = true;
    getActivities(id).then(result => {
      if (!active) return;
      setActivities(result.activities ?? []);
      setLoadError(result.message ?? "");
      setLoading(false);
    }).catch(() => { if (active) { setLoadError("Couldn’t load activity history. Please try again."); setLoading(false); } });
    return () => { active = false; };
  }, [id, retry]);

  function error(key: string) {
    return errors[key] ? <p className="mt-2 text-sm text-destructive" id={`activity-${key}-error`}>{errors[key]}</p> : null;
  }
  return <section className="tracker-panel space-y-5 p-6" aria-labelledby="activity-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="activity-heading" className="text-lg font-semibold">Activity history</h2><p className="mt-1 text-sm text-muted-foreground">Record outreach, applications, replies, and outcomes.</p></div>
      {!adding && <button className="tracker-button tracker-primary" disabled={loading || pending} onClick={() => { setWhen(newYorkInput()); setCustomDate(null); setSchedule(false); setErrors({}); setMessage(""); setSuccess(""); setAdding(true); }}>Log activity</button>}
    </div>
    {success && <p role="status" className="text-sm">{success}</p>}
    {adding && <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      startTransition(async () => {
        try {
          const result = await logActivity(id, form);
          if (!result.saved || !result.activities) { setErrors(result.errors ?? {}); setMessage(result.message ?? "Couldn’t save this activity."); return; }
          setActivities(result.activities); onUpdated(result.saved);
          setAdding(false); setNotes(""); setPositive(false); setMessage(""); setErrors({}); setLoadError("");
          setSuccess(schedule ? "Activity logged and follow-up saved in Next action." : "Activity logged.");
        } catch { setMessage("Couldn’t reach the app. Your entries are still here; please try again."); }
      });
    }} className="space-y-5 border-y py-5">
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={pending}>
        <legend className="sr-only">Log activity</legend>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="activity-type">Activity type</label>
          <select id="activity-type" name="activity_type" className="tracker-input" value={type} onChange={event => { setType(event.target.value as ActivityType); setSchedule(false); setPositive(false); }} aria-invalid={Boolean(errors.activity_type)} aria-describedby={errors.activity_type ? "activity-activity_type-error" : undefined}>
            {activityTypes.map(value => <option key={value}>{value}</option>)}
          </select>{error("activity_type")}
        </div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="activity-when">Activity date and time</label>
          <input id="activity-when" name="occurred_at" type="datetime-local" required className="tracker-input" value={when} onChange={event => setWhen(event.target.value)} aria-invalid={Boolean(errors.occurred_at)} aria-describedby={`activity-timezone${errors.occurred_at ? " activity-occurred_at-error" : ""}`} />
          <p className="mt-2 text-sm text-muted-foreground" id="activity-timezone">America/New_York</p>{error("occurred_at")}
        </div>
        <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium" htmlFor="activity-notes">Summary / notes (optional)</label><textarea id="activity-notes" name="notes" className="tracker-input" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div>
        {type === "Reply received" && <div className="sm:col-span-2"><label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input name="positive_response" type="checkbox" className="size-4" checked={positive} onChange={event => setPositive(event.target.checked)} />This is a positive response</label>{error("positive_response")}</div>}
        {isOutreach(type) && opportunity.status !== "Closed" && <div className="space-y-3 sm:col-span-2">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input name="schedule_follow_up" type="checkbox" checked={schedule} onChange={event => setSchedule(event.target.checked)} className="size-4" />Set a follow-up date</label>
          <p className="text-sm text-muted-foreground">Suggested {followUpDays} calendar days after this email. Accept it or choose another date.{opportunity.next_action || opportunity.next_action_date ? " This will replace the current Next action and its date." : ""}</p>
          <label className="block max-w-xs text-sm font-medium" htmlFor="activity-follow-up">Follow-up date<input id="activity-follow-up" name="follow_up_date" type="date" className="tracker-input mt-2" disabled={!schedule} required={schedule} value={followUp} onChange={event => setCustomDate(event.target.value)} aria-invalid={Boolean(errors.follow_up_date)} aria-describedby={errors.follow_up_date ? "activity-follow_up_date-error" : undefined} /></label>
          {error("follow_up_date")}{error("schedule_follow_up")}
        </div>}
      </fieldset>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : "Save activity"}</button><button type="button" className="tracker-button" disabled={pending} onClick={() => setAdding(false)}>Cancel activity</button></div>
    </form>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading activity history…</p> : loadError ? <div><p role="alert" className="text-sm text-destructive">{loadError}</p><button className="tracker-button mt-3" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Retry history</button></div> : activities.length ? <ol className="divide-y">
      {activities.map(activity => <li key={activity.id} className="space-y-2 py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium">{activity.activity_type}{activity.positive_response === 1 && <span className="tracker-badge ml-2">Positive</span>}</h3><time className="text-sm text-muted-foreground" dateTime={activity.occurred_at}>{displayActivityTime(activity.occurred_at)}</time></div>{activity.notes && <p className="whitespace-pre-wrap break-words text-sm">{activity.notes}</p>}</li>)}
    </ol> : <p className="text-sm text-muted-foreground">No activity yet. Log your first email, application, or note.</p>}
  </section>;
}
