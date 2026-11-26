import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGmailReplyMetadata, type GmailMessageMetadata } from "../src/lib/gmail-reply-metadata.ts";

function message(from = "Professor Example <Professor@lab.example>", extra: { name: string; value: string }[] = []): GmailMessageMetadata {
  return {
    id: "message-a", threadId: "thread-a", internalDate: String(Date.parse("2026-11-26T16:25:00.000Z")), labelIds: ["INBOX"],
    payload: { headers: [
      { name: "fRoM", value: from },
      { name: "in-reply-to", value: "<outbound@school.example>" },
      { name: "Date", value: "Wed, 25 Nov 2026 15:34:00 -0500" },
      ...extra,
    ] },
  };
}

test("reads only reply metadata and uses Gmail's internal timestamp", () => {
  assert.deepEqual(parseGmailReplyMetadata(message('"Example, Prof. <other@example.org>" <Professor+lab@LAB.example>')), {
    messageId: "message-a", threadId: "thread-a", sender: "professor+lab@lab.example", receivedAt: "2026-11-26T16:25:00.000Z",
  });
  const fallback = message("professor@lab.example");
  fallback.payload = { headers: [
    { name: "From", value: "professor@lab.example" },
    { name: "REFERENCES", value: "<first@school.example>\r\n\t<latest@school.example>" },
    { name: "Auto-Submitted", value: "No" },
  ] };
  assert.equal(parseGmailReplyMetadata(fallback)?.sender, "professor@lab.example");
});

test("skips sent mail, drafts, spam, trash, automated replies, and mailing lists", () => {
  for (const label of ["SENT", "DRAFT", "SPAM", "TRASH"]) {
    assert.equal(parseGmailReplyMetadata({ ...message(), labelIds: ["INBOX", label] }), null, label);
  }
  assert.equal(parseGmailReplyMetadata(message(undefined, [{ name: "Auto-Submitted", value: "auto-replied" }])), null);
  assert.equal(parseGmailReplyMetadata(message(undefined, [{ name: "List-Id", value: "<updates.lab.example>" }])), null);
});

test("skips original messages, ambiguous senders, and incomplete source references", () => {
  const initial = message();
  initial.payload = { headers: [
    { name: "From", value: "professor@lab.example" },
    { name: "Subject", value: "Re: research position" },
  ] };
  assert.equal(parseGmailReplyMetadata(initial), null);
  for (const from of ["Professor <professor@lab.example>, Assistant <assistant@lab.example>", "Team: professor@lab.example;", "Professor <professor@lab.example>\r\nBcc: assistant@lab.example"]) {
    assert.equal(parseGmailReplyMetadata(message(from)), null, from);
  }
  assert.equal(parseGmailReplyMetadata(message(undefined, [{ name: "From", value: "assistant@lab.example" }])), null);
  assert.equal(parseGmailReplyMetadata({ ...message(), internalDate: "NaN" }), null);
  assert.equal(parseGmailReplyMetadata({ ...message(), threadId: undefined }), null);
});
