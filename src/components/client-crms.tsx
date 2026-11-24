"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrackerHeader } from "@/components/tracker-header";
import { loadCrm, saveCrm, disconnectCrmGoogle } from "@/app/clients/actions";
import { editableCrmCell, novusClients, crmSheetId, type CrmCell, type CrmRecord } from "@/lib/novus-clients";
import type { CrmSnapshot } from "@/lib/crm-sheets";

const text = (cell?: CrmCell) => cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? "";

export function ClientCrms({ configured, connected, connectionMessage }: { configured: boolean; connected: boolean; connectionMessage: string }) {
  const [clientId, setClientId] = useState<string>(novusClients[0].id);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<CrmSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [mustRefresh, setMustRefresh] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const client = novusClients.find(client => client.id === clientId)!;
  const url = `https://docs.google.com/spreadsheets/d/${client.spreadsheetId}/edit#gid=${crmSheetId}`;
  useEffect(() => {
    if (!connected) return;
    let active = true;
    startTransition(async () => {
      setMessage(""); setData(null);
      try { const result = await loadCrm(clientId, page); if (active) { setData(result.data ?? null); setMessage(result.message ?? ""); setMustRefresh(false); } }
      catch { if (active) setMessage("Couldn’t reach the app. Try refreshing the CRM."); }
    });
    return () => { active = false; };
  }, [clientId, page, reload, connected]);
  const stages = [...new Set(data?.records.flatMap(record => [text(record.cells[0]), ...(record.cells[0].dataValidation?.condition?.values?.map(value => value.userEnteredValue ?? "") ?? [])]).filter(Boolean) ?? [])];
  const visible = data?.records.filter(record => (!stage || text(record.cells[0]) === stage) && (!query.trim() || record.cells.some(cell => text(cell).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))) ?? [];
  function cancel() { setEditing(null); setDraft([]); }
  function switchClient(id: string) { setClientId(id); setPage(0); setQuery(""); setStage(""); setSuccess(""); }
  return <div className="min-h-svh"><TrackerHeader active="clients" /><main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Novus Clients</h1><p className="mt-2 text-muted-foreground">View your partner CRMs and save edits back to Google Sheets.</p></div><div className="flex flex-wrap gap-2">{configured && <a className="tracker-button" href="/api/google/connect" aria-disabled={pending || Boolean(editing)} onClick={event => { if (pending || editing) event.preventDefault(); }}>{connected ? "Reconnect Google" : "Connect Google"}</a>}{connected && <button disabled={pending || Boolean(editing)} className="tracker-button" onClick={() => startTransition(async () => { try { await disconnectCrmGoogle(); setData(null); router.refresh(); } catch { setMessage("Couldn’t remove the local connection. Try again."); } })}>Disconnect locally</button>}</div></header>
    {connectionMessage && <p role="alert" className="text-sm text-destructive">{connectionMessage}</p>}
    {!configured && <section className="tracker-panel space-y-3 p-6"><h2 className="text-lg font-semibold">Set up Google access once</h2><p className="text-sm leading-relaxed text-muted-foreground">The app needs its own Google OAuth credentials to open these private sheets. Codex’s connected Google account is separate from this local app.</p><details className="text-sm"><summary className="cursor-pointer font-medium text-primary">Google setup instructions</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground"><li>Open <a className="underline underline-offset-4" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, select your project, and enable Google Sheets API.</li><li>Configure the consent screen and add your Google account as a test user.</li><li>Create a Web application OAuth client with redirect URI <code className="break-all">http://127.0.0.1:3000/api/google/callback</code>.</li><li>Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and <code>GOOGLE_REDIRECT_URI</code> in this repo’s ignored <code>.env.local</code>.</li><li>Restart the app, then select Connect Google. For another port, update both callback URLs to match.</li></ol><p className="mt-3 text-muted-foreground">Full instructions: <code>docs/google-sheets-setup.md</code>. Keep the client secret on this computer.</p></details></section>}
    {configured && !connected && <section className="tracker-panel space-y-3 p-6"><h2 className="text-lg font-semibold">Connect your Google account</h2><p className="text-sm leading-relaxed text-muted-foreground">Choose the account with edit access to your four CRMs. Google’s Sheets permission covers spreadsheets your account can access; this app restricts its CRM requests to the four listed here. Connecting alone does not edit a sheet.</p></section>}
    <nav className="flex flex-wrap gap-2" aria-label="Client CRM selection">{novusClients.map(item => <button key={item.id} disabled={pending || Boolean(editing)} aria-pressed={clientId === item.id} className={`tracker-button ${clientId === item.id ? "tracker-primary" : ""}`} onClick={() => switchClient(item.id)}>{item.name}</button>)}</nav>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{client.name}</h2><p className="mt-1 text-sm text-muted-foreground">Business record{data ? ` · Sheet rows ${2 + page * 100}–${101 + page * 100}` : ""}</p></div><div className="flex flex-wrap gap-2"><a className="tracker-button" href={url} target="_blank" rel="noreferrer">Open original sheet</a>{connected && <button className="tracker-button" disabled={pending || Boolean(editing)} onClick={() => { setSuccess(""); setReload(value => value + 1); }}>Refresh from Sheets</button>}</div></div>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}{success && <p role="status" className="text-sm text-primary">{success}</p>}
    {connected && pending && !data && <p role="status" className="text-sm text-muted-foreground">Loading CRM from Google Sheets…</p>}
    {data && <>
      <div className="tracker-panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_16rem]"><label className="text-sm font-medium">Search this page<input className="tracker-input mt-2" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Business, contact, referral, or notes" /></label><label className="text-sm font-medium">Website stage<select className="tracker-input mt-2" value={stage} onChange={event => setStage(event.target.value)}><option value="">All stages</option>{stages.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {editing && <form className="tracker-panel space-y-5 p-6" onSubmit={event => {
        event.preventDefault();
        const edits = draft.flatMap((value, column) => value !== text(editing.cells[column]) ? [{ column, value }] : []);
        if (!edits.length) { cancel(); return; }
        startTransition(async () => {
          setMessage(""); setSuccess("");
          try { const result = await saveCrm(clientId, editing.row, editing.version, edits); if (result.saved) { cancel(); setSuccess("Saved to Google Sheets."); setReload(value => value + 1); } else { setMessage(result.message ?? "The save could not be confirmed. Refresh before retrying."); setMustRefresh(true); } }
          catch { setMessage("The save could not be confirmed. Cancel editing and refresh from Sheets before retrying."); setMustRefresh(true); }
        });
      }}><div><h2 className="text-lg font-semibold">Edit {text(editing.cells[1]) || `row ${editing.row}`}</h2><p className="mt-1 text-sm text-muted-foreground">Sheet row {editing.row}. Save changes updates this row in the original CRM.</p></div><fieldset disabled={pending || mustRefresh} className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">CRM record fields</legend>{data.headers.map((header, column) => {
        const cell = editing.cells[column]; const editable = editableCrmCell(cell); const options = cell.dataValidation?.condition?.values?.map(value => value.userEnteredValue ?? "") ?? [];
        return <label key={column} className={`block text-sm font-medium ${column === 6 ? "sm:col-span-2" : ""}`}>{header}{!editable && <span className="ml-2 text-xs font-normal text-muted-foreground">Read-only</span>}{editable && options.length ? <select className="tracker-input mt-2" value={draft[column]} onChange={event => setDraft(values => values.map((value, index) => index === column ? event.target.value : value))}>{!options.includes(draft[column]) && <option value={draft[column]}>{draft[column] || "Choose stage"}</option>}{options.map(value => <option key={value}>{value}</option>)}</select> : <textarea className="tracker-input mt-2" rows={column === 6 ? 3 : 2} readOnly={!editable} value={draft[column]} maxLength={10000} onChange={event => setDraft(values => values.map((value, index) => index === column ? event.target.value : value))} />}</label>;
      })}</fieldset>{mustRefresh && <p className="text-sm text-muted-foreground">Cancel editing, refresh, and review the latest row before another save.</p>}<div className="flex flex-wrap gap-2"><button className="tracker-button tracker-primary" type="submit" disabled={pending || mustRefresh}>Save changes to Sheets</button><button className="tracker-button" type="button" disabled={pending} onClick={cancel}>Cancel editing</button></div></form>}
      <div className="tracker-panel overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{client.name} CRM records from Google Sheets</caption><thead className="border-b bg-muted/40"><tr>{["Website stage", "Business", "Contact", "Website / draft", ""].map((header, index) => <th className="px-4 py-3 font-medium" scope="col" key={index}>{header || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody>{visible.map(record => <tr className="border-b last:border-0 hover:bg-muted/30" key={record.row}><td className="px-4 py-4"><span className="tracker-badge">{text(record.cells[0]) || "No stage"}</span></td><td className="min-w-52 px-4 py-4"><p className="font-medium">{text(record.cells[1]) || "Unnamed business"}</p><p className="mt-1 text-xs text-muted-foreground">{text(record.cells[3])}</p></td><td className="min-w-40 whitespace-pre-wrap px-4 py-4">{text(record.cells[2]) || "—"}</td><td className="max-w-60 break-words px-4 py-4">{/^https?:\/\//i.test(text(record.cells[5])) ? <a className="text-primary underline underline-offset-4" href={text(record.cells[5])} target="_blank" rel="noreferrer">{text(record.cells[5])}</a> : text(record.cells[5]) || "—"}</td><td className="px-4 py-4"><button className="tracker-button" disabled={pending || Boolean(editing)} onClick={() => { setEditing(record); setDraft(record.cells.map(text)); setMessage(""); setSuccess(""); setMustRefresh(false); }}>Edit<span className="sr-only"> {text(record.cells[1]) || `row ${record.row}`}</span></button></td></tr>)}</tbody></table>{!visible.length && <p className="p-6 text-sm text-muted-foreground">{data.records.length ? "No records on this page match your filters." : "No business records in this section of the sheet."}</p>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><p>{visible.length} records shown · {data.headers.length} columns · Loaded {new Date(data.loadedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}</p><div className="flex gap-2"><button className="tracker-button" disabled={pending || Boolean(editing) || page === 0} onClick={() => { setPage(value => value - 1); setSuccess(""); }}>Previous records</button><button className="tracker-button" disabled={pending || Boolean(editing) || !data.hasMore} onClick={() => { setPage(value => value + 1); setSuccess(""); }}>Next records</button></div></div>
    </>}
  </main></div>;
}
