import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parseOpportunity } from "../src/lib/opportunity-model.ts";
import { activityTypes, parseActivity, type ActivityInput, type ActivityType } from "../src/lib/activity-model.ts";
import { goalTemplates, goalWithProgress, metricProgress, parseGoal, type GoalInput } from "../src/lib/goal-model.ts";
import { parseTask } from "../src/lib/task-model.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-goals-"));
  const filename = join(directory, "opportunities.sqlite");
  const store = openOpportunityStore(filename);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const create = (type = "Research") => store.create(parseOpportunity({ organization_name: "Test", title: "Summer", type, status: "Saved" }).data!);
  const data = () => ({ opportunities: store.list(), activities: store.allActivities(), tasks: store.tasks() });
  return { store, create, data, filename };
}
const event = (type: ActivityType, time: string, positive_response = false): ActivityInput => ({ activity_type: type, occurred_at: time, follow_up_date: null, notes: null, positive_response });
const goal: GoalInput = { title: "Outreach", metric_type: "research_contacts", target_count: 2, start_date: "2027-01-04", end_date: "2027-01-10", status: "active" };
const now = new Date("2027-02-01T12:00:00Z");

test("goal input validates integer targets, metrics, status, and inclusive date ranges", () => {
  assert.ok(parseGoal({ ...goal, target_count: "2" }).data);
  for (const change of [{ title: " " }, { target_count: "0" }, { target_count: "2.5" }, { target_count: "Infinity" }, { metric_type: "toString" }, { metric_type: "invented" }, { status: "completed" }, { start_date: "2027-02-29" }, { end_date: "2027-01-03" }]) {
    assert.ok(parseGoal({ ...goal, target_count: "2", ...change }).errors, JSON.stringify(change));
  }
  assert.ok(parseActivity({ activity_type: "Reply received", occurred_at: "2027-01-04T09:00", positive_response: "on" }).data?.positive_response);
  assert.ok(parseActivity({ activity_type: "General note", occurred_at: "2027-01-04T09:00", positive_response: "on" }).errors);
});

test("goal metrics use the first milestone across weeks and never count follow-ups as new contacts", t => {
  const { store, create, data } = fixture(t);
  const id = create();
  store.logActivity(id, event("Initial email sent", "2027-01-04T14:00:00.000Z"));
  store.logActivity(id, event("Initial email sent", "2027-01-12T14:00:00.000Z"));
  store.logActivity(id, event("Follow-up email sent", "2027-01-13T14:00:00.000Z"));
  store.logActivity(create(), event("Follow-up email sent", "2027-01-04T14:00:00.000Z"));
  store.logActivity(create("Startup"), event("Initial email sent", "2027-01-04T14:00:00.000Z"));
  const formal = create("Formal Internship");
  store.logActivity(formal, event("Application submitted", "2027-01-04T14:00:00.000Z"));
  store.logActivity(formal, event("Application submitted", "2027-01-05T14:00:00.000Z"));
  assert.equal(metricProgress("research_contacts", data(), "2027-01-04", "2027-01-10", now), 1);
  assert.equal(metricProgress("research_contacts", data(), "2027-01-11", "2027-01-17", now), 0);
  assert.equal(metricProgress("startup_contacts", data(), "2027-01-04", "2027-01-10", now), 1);
  assert.equal(metricProgress("formal_applications", data(), "2027-01-04", "2027-01-10", now), 1);
});

test("positive responses, completed meetings, received offers, and accepted offers are explicit distinct milestones", t => {
  const { store, create, data } = fixture(t);
  const id = create();
  store.logActivity(id, event("Reply received", "2027-01-04T14:00:00.000Z"));
  store.logActivity(id, event("Meeting scheduled", "2027-01-04T15:00:00.000Z"));
  assert.equal(metricProgress("positive_responses", data(), goal.start_date, goal.end_date, now), 0);
  assert.equal(metricProgress("meetings_completed", data(), goal.start_date, goal.end_date, now), 0);
  store.logActivity(id, event("Reply received", "2027-01-05T14:00:00.000Z", true));
  store.logActivity(id, event("Reply received", "2027-01-06T14:00:00.000Z", true));
  store.logActivity(id, event("Meeting completed", "2027-01-06T15:00:00.000Z"));
  store.logActivity(id, event("Interview completed", "2027-01-07T15:00:00.000Z"));
  store.logActivity(id, event("Offer received", "2027-01-08T15:00:00.000Z"));
  assert.equal(metricProgress("positive_responses", data(), goal.start_date, goal.end_date, now), 1);
  assert.equal(metricProgress("meetings_completed", data(), goal.start_date, goal.end_date, now), 1);
  assert.equal(metricProgress("offers_received", data(), goal.start_date, goal.end_date, now), 1);
  assert.equal(metricProgress("offers_accepted", data(), goal.start_date, goal.end_date, now), 0);
  store.logActivity(id, event("Offer accepted", "2027-01-09T15:00:00.000Z"));
  assert.equal(metricProgress("offers_accepted", data(), goal.start_date, goal.end_date, now), 1);
});

test("goal boundaries use New York dates, exclude future events, and do not increase as time elapses", t => {
  const { store, create, data } = fixture(t);
  store.logActivity(create(), event("Initial email sent", "2027-01-05T04:59:00.000Z"));
  store.logActivity(create(), event("Initial email sent", "2027-01-05T05:00:00.000Z"));
  store.logActivity(create(), event("Initial email sent", "2027-02-02T14:00:00.000Z"));
  assert.equal(metricProgress("research_contacts", data(), "2027-01-04", "2027-01-04", now), 1);
  assert.equal(metricProgress("research_contacts", data(), "2027-01-05", "2027-01-05", now), 1);
  assert.equal(metricProgress("research_contacts", data(), "2027-01-01", "2027-03-01", now), 2);
  const empty = { opportunities: [], activities: [], tasks: [] };
  const view = goalWithProgress({ ...goal, id: "goal", created_at: now.toISOString(), updated_at: now.toISOString() }, empty, now);
  assert.equal(view.current, 0); assert.equal(view.percentage, 0); assert.equal(view.completed, false);
});

test("goal CRUD and task progress persist, pause, recompute after reopening, and keep source records on deletion", t => {
  const { store, create, data, filename } = fixture(t);
  const id = store.createGoal(goal);
  assert.equal(Object.getPrototypeOf(store.getGoal(id)!), Object.prototype);
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import {openOpportunityStore} from ${JSON.stringify(new URL("../src/lib/opportunities.ts", import.meta.url).href)}; const store=openOpportunityStore(${JSON.stringify(filename)}); console.log(JSON.stringify(store.goals())); store.close();`], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout)[0].title, goal.title);
  assert.equal(store.updateGoal("missing", goal), false);
  store.updateGoal(id, { ...goal, status: "paused" }); assert.equal(store.getGoal(id)?.status, "paused");
  assert.throws(() => store.createGoal({ ...goal, target_count: 0 }));
  const task = store.createTask(parseTask({ title: "Resume", category: "Administration", priority: "high" }).data!);
  store.completeTask(task, true);
  assert.equal(metricProgress("tasks_completed", data(), "1970-01-01", "2099-01-01", new Date("2100-01-01")), 1);
  store.completeTask(task, false);
  assert.equal(metricProgress("tasks_completed", data(), "1970-01-01", "2099-01-01", new Date("2100-01-01")), 0);
  const opportunity = create(); store.logActivity(opportunity, event("Initial email sent", "2027-01-04T14:00:00.000Z"));
  assert.equal(store.deleteGoal(id), true); assert.equal(store.deleteGoal(id), false);
  assert.equal(store.activities(opportunity).length, 1); assert.ok(store.getTask(task));
});

test("goal templates use editable fixed targets and Monday-to-Sunday weekly periods", () => {
  const templates = goalTemplates("2026-11-22");
  assert.deepEqual(templates.slice(0, 4).map(item => item.target_count), [80, 50, 10, 1]);
  assert.equal(templates[3].metric_type, "offers_accepted");
  assert.equal(templates[4].start_date, "2026-11-16"); assert.equal(templates[4].end_date, "2026-11-22");
});

test("legacy activity migration preserves IDs, notes, opportunities, and cascade behavior", t => {
  const { create, filename } = fixture(t);
  const id = create();
  const legacy = new DatabaseSync(filename);
  const oldTypes = activityTypes.filter(type => type !== "Offer accepted").map(type => `'${type}'`).join(",");
  legacy.exec(`DROP TABLE activities; CREATE TABLE activities(id TEXT PRIMARY KEY NOT NULL, opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, activity_type TEXT NOT NULL CHECK(activity_type IN (${oldTypes})), occurred_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL) STRICT;`);
  legacy.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run("existing-activity", id, "Reply received", "2027-01-04T14:00:00.000Z", "Existing notes", "2027-01-04T14:00:00.000Z");
  legacy.close();
  const upgraded = openOpportunityStore(filename);
  try {
    assert.equal(upgraded.activities(id)[0].id, "existing-activity"); assert.equal(upgraded.activities(id)[0].notes, "Existing notes"); assert.equal(upgraded.activities(id)[0].positive_response, 0);
    upgraded.logActivity(id, event("Offer accepted", "2027-01-05T14:00:00.000Z"));
    upgraded.logActivity(id, event("Reply received", "2027-01-06T14:00:00.000Z", true));
    assert.equal(upgraded.activities(id)[0].positive_response, 1);
    upgraded.delete(id); assert.deepEqual(upgraded.activities(id), []);
  } finally { upgraded.close(); }
});
