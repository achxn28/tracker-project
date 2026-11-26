import assert from "node:assert/strict";
import { test } from "node:test";
import { collectGmailReplyCandidates, createGmailReplyMatcher, type GmailReplyContext, type GmailTrackedOpportunity } from "../src/lib/gmail-reply-matcher.ts";
import type { GmailMessageMetadata } from "../src/lib/gmail-reply-metadata.ts";

function opportunity(id: string, contact_email: string | null, overrides: Partial<GmailTrackedOpportunity> = {}): GmailTrackedOpportunity {
  return { id, contact_email, type: "Research", archived_at: null, status: "Contacted / Applied", ...overrides };
}

function message(id = "gmail-msg-1", sender = "Example Professor <person@college.example>", threadId = "gmail-thread-1"): GmailMessageMetadata {
  return {
    id, threadId, internalDate: String(Date.parse("2026-11-26T15:10:00.000Z")),
    payload: { headers: [{ name: "From", value: sender }, { name: "In-Reply-To", value: "<outreach@school.example>" }] },
  };
}

function context(overrides: Partial<GmailReplyContext> = {}): GmailReplyContext {
  return { mailboxId: "mailbox-a", ownAddresses: ["student@school.example"], opportunities: [], threadLinks: [], ...overrides };
}

test("uses a named thread link to resolve a shared research contact in the correct mailbox", () => {
  const shared = [opportunity("other", "PERSON@college.example"), opportunity("linked", "person@college.example")];
  const match = createGmailReplyMatcher(context({ opportunities: shared, threadLinks: [
    { mailboxId: "mailbox-a", threadId: "gmail-thread-1", opportunityId: "linked" },
    { mailboxId: "mailbox-b", threadId: "gmail-thread-1", opportunityId: "other" },
  ] }));
  assert.deepEqual(match(message()), {
    messageId: "gmail-msg-1", threadId: "gmail-thread-1", mailboxId: "mailbox-a", sender: "person@college.example", receivedAt: "2026-11-26T15:10:00.000Z",
    state: "matched", matchedBy: "thread", opportunityId: "linked",
  });
});

test("uses an exact address when no link exists and avoids guessing at aliases", () => {
  const match = createGmailReplyMatcher(context({ opportunities: [opportunity("tracked", " person@COLLEGE.example ")] }));
  const found = match(message());
  assert.ok(found?.state === "matched");
  assert.equal(found.matchedBy, "contact");
  assert.equal(found.opportunityId, "tracked");
  for (const address of ["person+lab@college.example", "per.son@college.example", "person@another.example", "imposter@college.example"]) {
    assert.equal(match(message(undefined, address)), null);
  }
});

test("puts shared addresses, conflicting thread links, and an unexpected sender into review", () => {
  const options = [opportunity("second", "person@college.example"), opportunity("first", "person@college.example"), opportunity("guest", "guest@college.example")];
  const link = { mailboxId: "mailbox-a", threadId: "gmail-thread-1", opportunityId: "first" };
  const shared = createGmailReplyMatcher(context({ opportunities: options }))(message());
  assert.ok(shared?.state === "needs-review");
  assert.equal(shared.reason, "shared-contact");
  assert.deepEqual(shared.opportunityIds, ["first", "second"]);

  const conflict = createGmailReplyMatcher(context({ opportunities: options, threadLinks: [link, { ...link, opportunityId: "second" }] }))(message());
  assert.ok(conflict?.state === "needs-review");
  assert.equal(conflict.reason, "conflicting-thread-links");

  const surprise = createGmailReplyMatcher(context({ opportunities: options, threadLinks: [link] }))(message(undefined, "guest@college.example"));
  assert.ok(surprise?.state === "needs-review");
  assert.equal(surprise.reason, "unexpected-thread-sender");
  assert.deepEqual(surprise.opportunityIds, ["first", "guest"]);
});

test("skips self replies and inactive records, and never redirects an inactive link", () => {
  const match = createGmailReplyMatcher(context({
    ownAddresses: ["student@school.example", "ALIAS@school.example"],
    opportunities: [
      opportunity("archive", "person@college.example", { archived_at: "2026-11-25T12:00:00Z" }),
      opportunity("closed", "person@college.example", { status: "Closed" }),
      opportunity("startup", "person@college.example", { type: "Startup" }),
      opportunity("active", "person@college.example"),
      opportunity("self", "alias@school.example"),
    ],
    threadLinks: [{ mailboxId: "mailbox-a", threadId: "inactive-thread", opportunityId: "archive" }],
  }));
  const active = match(message());
  assert.ok(active?.state === "matched");
  assert.equal(active.opportunityId, "active");
  assert.equal(match(message(undefined, "alias@school.example")), null);
  assert.equal(match(message(undefined, undefined, "inactive-thread")), null);
});

test("replays produce one candidate per mailbox and message, including unassigned candidates", () => {
  const tracked = context({ opportunities: [
    opportunity("one", "person@college.example"),
    opportunity("two", "person@college.example"),
  ] });
  const first = message();
  const second = message("gmail-msg-2");
  const all = collectGmailReplyCandidates(tracked, [first, first, second, second]);
  assert.deepEqual(all.map(candidate => [candidate.messageId, candidate.state]), [
    ["gmail-msg-1", "needs-review"], ["gmail-msg-2", "needs-review"],
  ]);
  // The worker can pass source IDs for candidates it already saved, including
  // those that were reviewed or dismissed.
  assert.deepEqual(collectGmailReplyCandidates(tracked, [first, second], [{ mailboxId: "mailbox-a", messageId: "gmail-msg-1" }]), all.slice(1));
  assert.deepEqual(collectGmailReplyCandidates(tracked, [second, first], all), []);
  assert.equal(collectGmailReplyCandidates({ ...tracked, mailboxId: "mailbox-b" }, [first], all).length, 1);
});

test("ignoring a non-match does not prevent a later match after a contact is added", () => {
  const first = message();
  const known = collectGmailReplyCandidates(context(), [first]);
  assert.deepEqual(known, []);
  const later = context({ opportunities: [opportunity("new", "person@college.example")] });
  const matched = collectGmailReplyCandidates(later, [first], known);
  assert.equal(matched[0]?.state, "matched");
});
