"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TrackerHeader } from "@/components/tracker-header";
import { savePreferences } from "@/app/settings/actions";

export function Settings({ initialTheme, initialInterval, gmailPanel }: { initialTheme: "light" | "dark"; initialInterval: number; gmailPanel: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  const [interval, setInterval] = useState(String(initialInterval));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div className="min-h-svh"><TrackerHeader active="settings" /><main className="mx-auto max-w-3xl space-y-7 px-5 py-8 sm:px-8 sm:py-10"><div><h1 className="text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-muted-foreground">Personalize your workspace and keep a copy of your records.</p></div>
    <form className="tracker-panel space-y-5 p-6" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(async () => { try { const result = await savePreferences(form); setErrors(result.errors ?? {}); setMessage(result.message ?? ""); setSuccess(Boolean(result.saved)); if (result.saved) router.refresh(); } catch { setMessage("Couldn’t reach the app. Please try again."); setSuccess(false); } }); }}>
      <h2 className="text-lg font-semibold">Preferences</h2><fieldset disabled={pending} className="space-y-5"><legend className="sr-only">Workspace preferences</legend>
        <label className="block text-sm font-medium">Theme<select className="tracker-input mt-2" name="theme" value={theme} onChange={event => setTheme(event.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <div><label className="block text-sm font-medium" htmlFor="follow-up-days">Default follow-up interval</label><input id="follow-up-days" name="follow_up_days" type="number" min={1} max={365} step={1} className="tracker-input mt-2" value={interval} onChange={event => setInterval(event.target.value)} required aria-invalid={Boolean(errors.follow_up_days)} aria-describedby="follow-up-days-help" /><p id="follow-up-days-help" className="mt-2 text-sm text-muted-foreground">Calendar days after an email, from 1 to 365. Existing reminders stay unchanged.</p>{errors.follow_up_days && <p className="mt-2 text-sm text-destructive">{errors.follow_up_days}</p>}</div>
      </fieldset>{message && <p role="alert" className="text-sm text-destructive">{message}</p>}{success && <p role="status" className="text-sm">Preferences saved.</p>}<button type="submit" className="tracker-button tracker-primary" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</button>
    </form>
    {gmailPanel}
    <section className="tracker-panel space-y-4 p-6"><h2 className="text-lg font-semibold">Recruiting goals</h2><p className="text-sm text-muted-foreground">Edit your saved targets or start from a weekly or long-term goal template.</p><Link className="tracker-button" href="/goals">Manage goals</Link></section>
    <section className="tracker-panel space-y-4 p-6"><h2 className="text-lg font-semibold">Export your data</h2><p className="text-sm text-muted-foreground">Download all opportunity records, including archived ones, and their activity history as UTF-8 CSV files. Activity timestamps are exported in UTC. Cells that could be spreadsheet formulas are escaped as text.</p><div className="flex flex-wrap gap-3"><a className="tracker-button" href="/export/opportunities" download>Export opportunities</a><a className="tracker-button" href="/export/activities" download>Export activities</a></div></section>
  </main></div>;
}
