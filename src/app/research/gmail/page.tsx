import Link from "next/link";
import { headers } from "next/headers";
import { GmailReviewForm } from "@/components/gmail-review-form";
import { TrackerHeader } from "@/components/tracker-header";
import { displayActivityTime } from "@/lib/activity-model";
import { gmailConfig, gmailConnection } from "@/lib/gmail-connection";
import { isOpenResearchOpportunity } from "@/lib/gmail-reply-matcher";
import { openGmailReplyStore } from "@/lib/gmail-reply-store";
import { gmailConversationHref, gmailScanDays } from "@/lib/gmail-reply-sync";
import { withTrackerStore } from "@/lib/tracker-store";

export const dynamic = "force-dynamic";

async function localReview() {
  const config = gmailConfig();
  if (!config) return null;
  const { port } = new URL(config.redirectUri);
  const host = (await headers()).get("host")?.toLowerCase();
  if (!["127.0.0.1", "localhost"].some(name => host === (port ? `${name}:${port}` : name))) return null;
  const mailbox = gmailConnection(config).mailbox();
  if (!mailbox) return null;
  const store = openGmailReplyStore(config);
  try {
    return { email: mailbox.email, replies: store.reviews(mailbox.mailboxId), links: store.links(mailbox.mailboxId) };
  } finally {
    store.close();
  }
}

const matchLabels = {
  contact: "Saved contact",
  thread: "Linked conversation",
  "shared-contact": "Address matches multiple contacts",
  "conflicting-thread-links": "Conversation linked to multiple contacts",
  "unexpected-thread-sender": "Different sender in linked conversation",
};

export default async function GmailReviewPage() {
  let data: Awaited<ReturnType<typeof localReview>> = null;
  let error = false;
  try { data = await localReview(); } catch { error = true; }
  const opportunities = data ? await withTrackerStore(store => store.list()) : [];
  const active = opportunities.filter(isOpenResearchOpportunity);
  const activeIds = new Set(active.map(item => item.id));
  const names = new Map(opportunities.map(item => [item.id, [item.contact_name, item.organization_name].filter(Boolean).join(" · ")]));
  const queue = data?.replies.filter(({ review }) => review.state === "pending" || review.state === "applying") ?? [];
  const approved = data?.replies.filter(({ review }) => review.state === "approved") ?? [];
  const label = (id: string) => names.get(id) ?? "Removed research opportunity";

  return <div className="min-h-svh">
    <TrackerHeader active="research" />
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <Link href="/research" className="text-sm text-primary underline-offset-4 hover:underline">Research outreach</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gmail review</h1>
        <p className="mt-2 text-muted-foreground">Check replies from the last {gmailScanDays} days for saved research contacts and linked conversations.</p>
        <Link href="/research/gmail/suggestions" className="tracker-button mt-4">Try task suggestions</Link>
      </header>

      {!data ? <section className="tracker-panel space-y-3 p-5">
        <p>{error ? "Tracker could not read your local Gmail connection or review data." : "Connect Gmail to start checking for replies."}</p>
        <Link href="/settings" className="tracker-button">Open Settings</Link>
      </section> : <>
        <section className="tracker-panel space-y-3 p-5">
          <p className="break-words text-sm text-muted-foreground">{data.email}</p>
          <GmailReviewForm>
            <button name="operation" value="check" className="tracker-button tracker-primary">Check Gmail</button>
          </GmailReviewForm>
        </section>

        <section className="tracker-panel divide-y" aria-label="Replies to review">
          <h2 className="p-5 font-semibold">Replies to review ({queue.length})</h2>
          {queue.length === 0 && <p className="p-5 text-sm text-muted-foreground">No replies waiting for review.</p>}
          {queue.map(({ candidate, review }) => {
            const matches = candidate.state === "matched" ? [candidate.opportunityId] : candidate.opportunityIds;
            const options = review.state === "applying" ? [review.opportunityId] : matches.filter(id => activeIds.has(id));
            return <article key={candidate.messageId} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="break-all font-medium">{candidate.sender}</h3>
                <a href={gmailConversationHref(data.email, candidate.threadId)} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">Open in Gmail</a>
              </div>
              <p className="text-sm text-muted-foreground">
                {displayActivityTime(candidate.receivedAt)} · {matchLabels[candidate.state === "matched" ? candidate.matchedBy : candidate.reason]}
              </p>
              <GmailReviewForm>
                <input type="hidden" name="message" value={candidate.messageId} />
                {options.length > 1 ? <label className="text-sm font-medium">Research contact
                  <select name="opportunity" className="tracker-input mt-1" required defaultValue="">
                    <option value="" disabled>Choose a contact</option>
                    {options.map(id => <option key={id} value={id}>{label(id)}</option>)}
                  </select>
                </label> : options[0] ? <>
                  <input type="hidden" name="opportunity" value={options[0]} />
                  <p className="self-center text-sm">{label(options[0])}</p>
                </> : <p className="self-center text-sm text-muted-foreground">The matched opportunity is unavailable.</p>}
                {options.length > 0 && <button name="operation" value="approve" className="tracker-button tracker-primary">{review.state === "applying" ? "Retry approval" : "Approve reply"}</button>}
                {review.state === "pending" && <button name="operation" value="dismiss" formNoValidate className="tracker-button">Dismiss</button>}
              </GmailReviewForm>
            </article>;
          })}
        </section>

        <details className="tracker-panel space-y-4 p-5">
          <summary className="cursor-pointer font-semibold">Linked conversations ({data.links.length})</summary>
          <p className="text-sm text-muted-foreground">Paste a Gmail conversation link. If Gmail can’t resolve the link, copy the Message-ID from the email’s Show original menu.</p>
          {active.length > 0 && <GmailReviewForm>
            <label className="min-w-0 flex-1 basis-56 text-sm font-medium">Gmail link or Message-ID
              <input className="tracker-input mt-1" name="thread" required maxLength={600} />
            </label>
            <label className="min-w-0 flex-1 basis-48 text-sm font-medium">Research contact
              <select name="opportunity" className="tracker-input mt-1" required defaultValue="">
                <option value="" disabled>Choose a contact</option>
                {active.map(item => <option key={item.id} value={item.id}>{label(item.id)}</option>)}
              </select>
            </label>
            <button name="operation" value="link" className="tracker-button">Link conversation</button>
          </GmailReviewForm>}
          {data.links.length > 0 && <ul className="divide-y">
            {data.links.map(link => <li key={link.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <a href={gmailConversationHref(data.email, link.threadId)} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">{label(link.opportunityId)}</a>
              <GmailReviewForm><input type="hidden" name="link" value={link.key} /><button name="operation" value="unlink" className="tracker-button">Unlink</button></GmailReviewForm>
            </li>)}
          </ul>}
        </details>

        {approved.length > 0 && <details className="tracker-panel space-y-4 p-5">
          <summary className="cursor-pointer font-semibold">Approved replies ({approved.length})</summary>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {approved.map(({ candidate, review }) => review.state === "approved" && <li key={candidate.messageId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <Link href={`/research?opportunity=${encodeURIComponent(review.opportunityId)}`} className="underline-offset-4 hover:underline">{label(review.opportunityId)} · {displayActivityTime(candidate.receivedAt)}</Link>
              <a href={gmailConversationHref(data.email, candidate.threadId)} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">Open in Gmail</a>
            </li>)}
          </ul>
        </details>}
      </>}
    </main>
  </div>;
}
