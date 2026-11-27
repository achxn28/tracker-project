import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectGmailReplyCandidates, type GmailReplyContext } from "../src/lib/gmail-reply-matcher.ts";
import type { GmailMessageMetadata } from "../src/lib/gmail-reply-metadata.ts";
import { resolveGmailThread, scanGmailReplies } from "../src/lib/gmail-reply-sync.ts";
import { openGmailReplyStore } from "../src/lib/gmail-reply-store.ts";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parseOpportunity } from "../src/lib/opportunity-model.ts";

const now = Date.parse("2026-11-27T15:00:00Z");
const contact = "professor@college.example";
const own = "student@school.example";
const context: GmailReplyContext = {
  mailboxId: "fixture-mailbox",
  ownAddresses: [own],
  opportunities: [
    { id: "one", type: "Research", status: "Contacted / Applied", archived_at: null, contact_email: contact },
    { id: "two", type: "Research", status: "Contacted / Applied", archived_at: null, contact_email: contact },
    { id: "closed", type: "Research", status: "Closed", archived_at: null, contact_email: "closed@college.example" },
  ],
  threadLinks: [{ mailboxId: "fixture-mailbox", threadId: "linked", opportunityId: "one" }],
};

function message(id: string, threadId: string, sender = contact, reference = "<outreach@school.example>", age = 1): GmailMessageMetadata {
  return {
    id, threadId, internalDate: String(now - age * 86400000),
    payload: { headers: [{ name: "From", value: sender }, { name: "In-Reply-To", value: reference }] },
  };
}

test("a read-only scan checks scoped senders, linked threads, and Sent references", async () => {
  const good = message("match", "found");
  const unrelated = message("unrelated", "found", contact, "<different@school.example>");
  const otherSender = message("assistant", "linked", "assistant@college.example");
  const sent: GmailMessageMetadata = {
    id: "outgoing", threadId: "found", internalDate: String(now - 2 * 86400000), labelIds: ["SENT"],
    payload: { headers: [{ name: "Message-ID", value: "<outreach@school.example>" }] },
  };
  const threads: Record<string, GmailMessageMetadata[]> = {
    found: [sent, good, unrelated, message("not-listed", "found")],
    linked: [otherSender, message("old", "linked", contact, undefined, 31), message("self", "linked", own)],
  };
  const visited: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://gmail.googleapis.com");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
    assert.equal(init?.method ?? "GET", "GET");
    const path = url.pathname.split("/").at(-1)!;
    visited.push(path);
    if (path === "messages") {
      assert.match(url.searchParams.get("q")!, /from:"professor@college.example"/);
      assert.doesNotMatch(url.searchParams.get("q")!, /closed@college/);
      return Response.json({ messages: [good, unrelated].map(({ id, threadId }) => ({ id, threadId })), nextPageToken: "more" });
    }
    assert.equal(url.searchParams.get("format"), "metadata");
    assert.ok(url.searchParams.getAll("metadataHeaders").includes("Message-ID"));
    assert.doesNotMatch(url.searchParams.get("fields")!, /body|snippet|raw/);
    return Response.json({ messages: threads[path] });
  };
  const result = await scanGmailReplies("fixture", context, fetcher, now);
  assert.deepEqual(new Set(visited), new Set(["messages", "found", "linked"]));
  assert.equal(result.limited, true);
  const candidates = collectGmailReplyCandidates(context, result.replies);
  assert.deepEqual(candidates.map(candidate => [candidate.messageId, candidate.state]), [["assistant", "needs-review"], ["match", "needs-review"]]);
  assert.deepEqual(candidates[1].state === "needs-review" && candidates[1].opportunityIds, ["one", "two"]);
});

test("a Gmail Message-ID resolves to a single provider conversation", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("q"), 'rfc822msgid:"outreach@school.example"');
    return Response.json({ messages: [{ id: "message", threadId: "thread" }] });
  };
  assert.equal(await resolveGmailThread("fixture", "<outreach@school.example>", fetcher), "thread");
});

test("approval survives an interrupted write and concurrent review decisions", t => {
  const dir = mkdtempSync(join(tmpdir(), "tracker-gmail-review-"));
  const config = { tokenPath: join(dir, "tokens.enc"), encryptionKey: Buffer.alloc(32, 19) };
  const tracker = openOpportunityStore(join(dir, "tracker.sqlite"));
  let review = openGmailReplyStore(config);
  t.after(() => { review.close(); tracker.close(); rmSync(dir, { recursive: true, force: true }); });

  const input = parseOpportunity({ organization_name: "College", title: "Lab", type: "Research", status: "Contacted / Applied",
    priority: "medium", work_arrangement: "unspecified", contact_email: contact });
  assert.ok(input.data);
  const id = tracker.create(input.data);
  const alternate = tracker.create(input.data);
  const scoped = { ...context, threadLinks: [], opportunities: [tracker.get(id)!, tracker.get(alternate)!] };
  const reply = message("reply", "thread");
  const ignored = message("ignored", "thread");
  assert.equal(review.collect(scoped, [reply, ignored]).length, 2);
  review.dismiss(scoped.mailboxId, ignored.id!);
  assert.equal(review.beginApproval(scoped.mailboxId, reply.id!, id).review.state, "applying");
  assert.throws(() => review.beginApproval(scoped.mailboxId, reply.id!, alternate));
  assert.throws(() => review.dismiss(scoped.mailboxId, reply.id!));

  const activity = { activity_type: "Reply received" as const, occurred_at: new Date(now - 86400000).toISOString(), notes: null, follow_up_date: null };
  assert.equal(tracker.logActivity(id, activity, "gmail-stable-key"), "gmail-stable-key");
  review.close();
  review = openGmailReplyStore(config);
  assert.equal(review.beginApproval(scoped.mailboxId, reply.id!, id).review.state, "applying");
  assert.equal(tracker.logActivity(id, activity, "gmail-stable-key"), "gmail-stable-key");
  review.finishApproval(scoped.mailboxId, reply.id!, id);

  assert.equal(tracker.activities(id).length, 1);
  assert.equal(tracker.get(id)?.status, "Responded");
  assert.deepEqual(review.collect(scoped, [reply, ignored]), []);
  assert.deepEqual(review.reviews(scoped.mailboxId).map(entry => entry.review.state), ["approved", "dismissed"]);
  assert.throws(() => tracker.logActivity(alternate, activity, "gmail-stable-key"));
});
