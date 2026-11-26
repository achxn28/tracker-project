import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openGmailReplyStore } from "../src/lib/gmail-reply-store.ts";
import type { GmailReplyContext } from "../src/lib/gmail-reply-matcher.ts";
import type { GmailMessageMetadata } from "../src/lib/gmail-reply-metadata.ts";

const address = "researcher@college.example";
const context: GmailReplyContext = {
  mailboxId: "fixture-mailbox-one",
  ownAddresses: ["student@school.example"],
  opportunities: [{ id: "lab-one", type: "Research", status: "Contacted / Applied", archived_at: null, contact_email: address }],
  threadLinks: [],
};
const message: GmailMessageMetadata = {
  id: "fixture-message-unique",
  threadId: "fixture-thread-source",
  internalDate: String(Date.parse("2026-11-26T15:10:00.000Z")),
  payload: { headers: [{ name: "From", value: address }, { name: "In-Reply-To", value: "<outreach@school.example>" }] },
};

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-gmail-replies-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, config: { tokenPath: join(directory, "tokens.enc"), encryptionKey: Buffer.alloc(32, 31) } };
}

test("encrypted candidate sources survive a restart and suppress replays", t => {
  const { directory, config } = fixture(t);
  const store = openGmailReplyStore(config);
  let recorded;
  try {
    recorded = store.collect(context, [message, message]);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.state, "matched");
  } finally {
    store.close();
  }
  const filename = join(directory, "replies.sqlite");
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  const raw = readFileSync(filename);
  for (const value of [context.mailboxId, message.id!, message.threadId!, address]) assert.equal(raw.includes(value), false);

  const script = `
    import { openGmailReplyStore } from ${JSON.stringify(new URL("../src/lib/gmail-reply-store.ts", import.meta.url).href)};
    const config = { tokenPath: ${JSON.stringify(config.tokenPath)}, encryptionKey: Buffer.alloc(32, 31) };
    const context = ${JSON.stringify(context)};
    const message = ${JSON.stringify(message)};
    const store = openGmailReplyStore(config);
    try { console.log(JSON.stringify({ replay: store.collect(context, [message]), saved: store.candidates(context.mailboxId) })); }
    finally { store.close(); }
  `;
  const fresh = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.deepEqual(JSON.parse(fresh.stdout), { replay: [], saved: recorded });
});

test("two database handles preserve the first candidate and scope reuse to the mailbox", t => {
  const { config } = fixture(t);
  const first = openGmailReplyStore(config);
  const second = openGmailReplyStore(config);
  try {
    const [saved] = first.collect(context, [message]);
    assert.deepEqual(second.collect(context, [message]), []);
    const other = { ...context, mailboxId: "fixture-mailbox-two", opportunities: [
      ...context.opportunities, { ...context.opportunities[0], id: "shared-address" },
    ] };
    assert.equal(second.collect(other, [message])[0]?.state, "needs-review");
    assert.deepEqual(first.candidates(context.mailboxId), [saved]);
    assert.equal(first.candidates(other.mailboxId).length, 1);
  } finally {
    first.close();
    second.close();
  }
});
