import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parseOpportunity } from "../src/lib/opportunity-model.ts";
import { activityTypes, newYorkInput, newYorkInstant, parseActivity, suggestedFollowUp, type ActivityInput, type ActivityType } from "../src/lib/activity-model.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-activities-"));
  const filename = join(directory, "opportunities.sqlite");
  const store = openOpportunityStore(filename);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const create = (raw: Record<string, unknown> = {}) => store.create(parseOpportunity({ organization_name: "Test Lab", title: "Research", type: "Research", status: "Saved", ...raw }).data!);
  return { store, create, filename };
}
const activity = (activity_type: ActivityType, occurred_at = "2027-01-04T15:00:00.000Z", extras: Partial<ActivityInput> = {}): ActivityInput => ({ activity_type, occurred_at, notes: null, follow_up_date: null, ...extras });

test("New York wall times convert to UTC across midnight and daylight saving boundaries", () => {
  assert.equal(newYorkInstant("2027-01-04T23:45"), "2027-01-05T04:45:00.000Z");
  assert.equal(newYorkInstant("2027-07-04T09:00"), "2027-07-04T13:00:00.000Z");
  assert.equal(newYorkInstant("2027-03-14T02:30"), null);
  assert.equal(newYorkInstant("2026-11-01T01:30"), "2026-11-01T05:30:00.000Z");
  assert.equal(newYorkInstant("2027-02-29T09:00"), null);
  assert.equal(newYorkInstant("not-a-date"), null);
  assert.equal(newYorkInput(new Date("2027-01-05T04:45:00.000Z")), "2027-01-04T23:45");
  assert.equal(suggestedFollowUp("2027-03-07T23:45"), "2027-03-14");
  assert.equal(suggestedFollowUp("2026-12-28T09:00"), "2027-01-04");
});

test("activity input validates types, timestamps, and optional follow-up dates", () => {
  const raw = { activity_type: "Initial email sent", occurred_at: "2027-01-04T09:00", notes: "  Sent intro  " };
  assert.equal(parseActivity(raw).data?.occurred_at, "2027-01-04T14:00:00.000Z");
  assert.equal(parseActivity(raw).data?.notes, "Sent intro");
  assert.equal(parseActivity(raw).data?.follow_up_date, null);
  for (const change of [{ activity_type: "Unknown" }, { occurred_at: "bad" }, { occurred_at: "2027-03-14T02:30" }, { schedule_follow_up: "on", follow_up_date: "2027-02-29" }, { activity_type: "General note", schedule_follow_up: "on", follow_up_date: "2027-01-11" }]) {
    assert.ok(parseActivity({ ...raw, ...change }).errors, JSON.stringify(change));
  }
  assert.equal(parseActivity({ ...raw, schedule_follow_up: "on", follow_up_date: "2027-01-12" }).data?.follow_up_date, "2027-01-12");
});

test("history is opportunity-specific, chronological, serializable, and persistent in another process", t => {
  const { store, create, filename } = fixture(t);
  const id = create();
  const other = create();
  store.logActivity(id, activity("Reply received", "2027-01-06T14:00:00.000Z", { notes: "O'Connor replied\nSecond line" }));
  store.logActivity(id, activity("Initial email sent"));
  store.logActivity(other, activity("General note"));
  assert.deepEqual(store.activities(id).map(row => row.activity_type), ["Reply received", "Initial email sent"]);
  assert.equal(Object.getPrototypeOf(store.activities(id)[0]), Object.prototype);
  assert.equal(store.activities(id)[0].notes, "O'Connor replied\nSecond line");
  assert.deepEqual(store.activities("' OR 1=1 --"), []);
  const moduleUrl = new URL("../src/lib/opportunities.ts", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import {openOpportunityStore} from ${JSON.stringify(moduleUrl)}; const store=openOpportunityStore(${JSON.stringify(filename)}); console.log(JSON.stringify(store.activities(${JSON.stringify(id)}))); store.close();`], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).length, 2);
  assert.equal(store.activities(other).length, 1);
});

test("pipeline advances appropriately without regression or reopening a closed opportunity", t => {
  const { store, create } = fixture(t);
  const id = create();
  store.logActivity(id, activity("Initial email sent"));
  assert.equal(store.get(id)?.status, "Contacted / Applied");
  store.logActivity(id, activity("Reply received", "2027-01-05T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Responded");
  store.logActivity(id, activity("Meeting scheduled", "2027-01-06T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Meeting / Interview");
  store.logActivity(id, activity("Offer received", "2027-01-08T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Offer");
  store.logActivity(id, activity("Rejection received", "2027-01-03T14:00:00.000Z"));
  store.logActivity(id, activity("Initial email sent", "2027-01-09T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Offer");
  store.logActivity(id, activity("Rejection received", "2027-01-10T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Closed");
  assert.equal(store.get(id)?.closed_outcome, "rejected");
  store.logActivity(id, activity("Offer received", "2027-01-11T14:00:00.000Z"));
  assert.equal(store.get(id)?.status, "Closed");
  const withdrawn = create({ status: "Closed", closed_outcome: "withdrawn" });
  store.logActivity(withdrawn, activity("Rejection received"));
  assert.equal(store.get(withdrawn)?.closed_outcome, "withdrawn");
  const formal = create({ type: "Formal Internship" });
  store.logActivity(formal, activity("Application submitted"));
  assert.equal(store.get(formal)?.status, "Contacted / Applied");
});

test("repeated initial emails and follow-ups never inflate distinct outreach counts", t => {
  const { store, create } = fixture(t);
  const research = create();
  const startup = create({ type: "Startup" });
  const formal = create({ type: "Formal Internship" });
  const followUpOnly = create();
  store.logActivity(followUpOnly, activity("Follow-up email sent"));
  assert.equal(store.outreachCounts().research_contacts, 0);
  for (let i = 0; i < 3; i++) {
    store.logActivity(research, activity("Initial email sent"));
    store.logActivity(research, activity("Follow-up email sent"));
    store.logActivity(startup, activity("Initial email sent"));
    store.logActivity(formal, activity("Application submitted"));
  }
  assert.deepEqual(store.outreachCounts(), { research_contacts: 1, startup_contacts: 1, formal_applications: 1 });
  assert.equal(store.activities(research).length, 6);
  store.delete(research);
  assert.equal(store.outreachCounts().research_contacts, 0);
});

test("follow-up scheduling is explicit, and failed writes leave no partial history", t => {
  const { store, create } = fixture(t);
  const id = create({ next_action: "Review a paper", next_action_date: "2027-01-12" });
  store.logActivity(id, activity("Initial email sent"));
  assert.equal(store.get(id)?.next_action, "Review a paper");
  assert.equal(store.get(id)?.next_action_date, "2027-01-12");
  store.logActivity(id, activity("Follow-up email sent", undefined, { follow_up_date: "2027-01-14" }));
  assert.equal(store.get(id)?.next_action, "Send follow-up email");
  assert.equal(store.get(id)?.next_action_date, "2027-01-14");
  assert.throws(() => store.logActivity("missing", activity("Initial email sent")));
  assert.deepEqual(store.activities("missing"), []);
  const closed = create({ status: "Closed" });
  assert.throws(() => store.logActivity(closed, activity("Initial email sent", undefined, { follow_up_date: "2027-01-14" })));
  assert.deepEqual(store.activities(closed), []);
  assert.equal(store.get(closed)?.status, "Closed");
  // A constraint failure after beginning a transaction must roll back both writes.
  assert.throws(() => store.logActivity(id, activity("Unknown" as ActivityType)));
  assert.equal(store.activities(id).length, 2);
  assert.equal(store.get(id)?.next_action_date, "2027-01-14");
});

test("adding activity storage preserves pre-existing opportunities and cascades only their own history", t => {
  const { store, create, filename } = fixture(t);
  const id = create({ notes: "Existing personal record" });
  const old = new DatabaseSync(filename);
  old.exec("DROP TABLE activities");
  old.close();
  const upgraded = openOpportunityStore(filename);
  try {
    assert.equal(upgraded.get(id)?.notes, "Existing personal record");
    assert.deepEqual(upgraded.activities(id), []);
    for (const type of activityTypes) upgraded.logActivity(id, activity(type));
    const other = create();
    upgraded.logActivity(other, activity("General note"));
    assert.equal(upgraded.activities(id).length, activityTypes.length);
    upgraded.delete(id);
    assert.deepEqual(upgraded.activities(id), []);
    assert.equal(upgraded.activities(other).length, 1);
  } finally { upgraded.close(); }
  assert.equal(store.get(id), undefined);
});
