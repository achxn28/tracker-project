import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parseOpportunity } from "../src/lib/opportunity-model.ts";
import { parseTask, sortTasks } from "../src/lib/task-model.ts";
import { addCalendarDays, buildActionQueue, todayInNewYork } from "../src/lib/action-queue.ts";
import type { ActivityInput } from "../src/lib/activity-model.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-tasks-"));
  const filename = join(directory, "opportunities.sqlite");
  const store = openOpportunityStore(filename);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const opportunity = (raw: Record<string, unknown> = {}) => store.create(parseOpportunity({ organization_name: "Test Lab", title: "Summer research", type: "Research", status: "Saved", ...raw }).data!);
  const task = (raw: Record<string, unknown> = {}) => store.createTask(parseTask({ title: "Read a paper", category: "Research", priority: "medium", ...raw }).data!);
  const queue = () => buildActionQueue(store.list(), store.tasks(), store.allActivities(), "2027-01-04");
  return { store, filename, opportunity, task, queue };
}
const email: ActivityInput = { activity_type: "Initial email sent", occurred_at: "2027-01-04T14:00:00.000Z", follow_up_date: "2027-01-11", notes: null };

test("task validation supports optional dates and rejects invalid fields and reversed ranges", () => {
  const valid = { title: "  Update resume  ", category: "Portfolio / Projects", priority: "high" };
  assert.equal(parseTask(valid).data?.title, "Update resume");
  assert.equal(parseTask(valid).data?.due_date, null);
  assert.ok(parseTask({ ...valid, start_date: "2028-02-29" }).data);
  for (const change of [{ title: " " }, { category: "Other" }, { priority: "urgent" }, { due_date: "2027-02-29" }, { start_date: "bad" }, { start_date: "2027-01-06", due_date: "2027-01-04" }]) {
    assert.ok(parseTask({ ...valid, ...change }).errors, JSON.stringify(change));
  }
});

test("tasks persist through a separate process with stable completion and standalone fallback", t => {
  const { store, filename, opportunity, task } = fixture(t);
  const opportunityId = opportunity();
  const id = task({ opportunity_id: opportunityId, description: "First line\nSecond line", start_date: "2027-01-03", due_date: "2027-01-04" });
  const standalone = task({ title: "Technical resume" });
  const created = store.getTask(id)!;
  assert.equal(Object.getPrototypeOf(created), Object.prototype);
  assert.equal(store.updateTask("missing", parseTask({ ...created }).data!), false);
  assert.equal(store.updateTask(id, { ...created, title: "Read another paper" }), true);
  store.completeTask(id, true);
  const completed = store.getTask(id)!.completed_at;
  assert.ok(completed);
  store.completeTask(id, true);
  assert.equal(store.getTask(id)?.completed_at, completed);
  assert.equal(store.getTask(id)?.created_at, created.created_at);
  assert.throws(() => task({ opportunity_id: "missing" }));
  assert.throws(() => store.completeTask("missing", true));
  const moduleUrl = new URL("../src/lib/opportunities.ts", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import {openOpportunityStore} from ${JSON.stringify(moduleUrl)}; const store=openOpportunityStore(${JSON.stringify(filename)}); console.log(JSON.stringify(store.getTask(${JSON.stringify(id)}))); store.close();`], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).title, "Read another paper");
  assert.equal(JSON.parse(child.stdout).completed_at, completed);
  store.completeTask(id, false);
  assert.equal(store.getTask(id)?.completed_at, null);
  store.delete(opportunityId);
  assert.equal(store.getTask(id)?.opportunity_id, null);
  assert.equal(store.getTask(id)?.title, "Read another paper");
  assert.equal(store.getTask(standalone)?.opportunity_id, null);
  assert.equal(store.deleteTask(id), true);
  assert.equal(store.deleteTask(id), false);
  assert.equal(store.getTask(standalone)?.title, "Technical resume");
});

test("tasks sort dated items first, then priority, with undated items last", t => {
  const { store, task } = fixture(t);
  task({ title: "Undated" });
  task({ title: "Medium", due_date: "2027-01-04" });
  task({ title: "High", priority: "high", due_date: "2027-01-04" });
  task({ title: "Earlier", priority: "low", due_date: "2027-01-03" });
  assert.deepEqual(sortTasks(store.tasks()).map(item => item.title), ["Earlier", "High", "Medium", "Undated"]);
});

test("queue ordering, seven-day boundaries, completion, and submitted deadlines", t => {
  const { store, opportunity, task, queue } = fixture(t);
  const overdue = task({ title: "Overdue task", due_date: "2027-01-02" });
  const today = task({ title: "Today task", due_date: "2027-01-04" });
  const upcoming = task({ title: "Upcoming task", due_date: "2027-01-11" });
  task({ title: "Too far", due_date: "2027-01-12" });
  task();
  const completed = task({ title: "Done", due_date: "2027-01-01" }); store.completeTask(completed, true);
  const action = opportunity({ next_action: "Prepare outreach", next_action_date: "2027-01-03" });
  const deadline = opportunity({ type: "Formal Internship", deadline: "2027-01-11" });
  opportunity({ deadline: "2027-01-12" });
  opportunity({ deadline: "2027-01-03" });
  opportunity({ status: "Closed", deadline: "2027-01-04", next_action: "Ignore", next_action_date: "2027-01-01" });
  const submitted = opportunity({ type: "Formal Internship", deadline: "2027-01-05" });
  store.logActivity(submitted, { ...email, activity_type: "Application submitted", follow_up_date: null });
  const saved = store.get(submitted)!; store.update(submitted, { ...saved, status: "Saved" });
  const ready = opportunity({ status: "Ready for Outreach" });
  assert.deepEqual(queue().map(item => [item.id, item.section]), [[overdue, "Overdue"], [action, "Overdue"], [deadline, "Approaching deadlines"], [today, "Due today"], [upcoming, "Upcoming"], [ready, "Ready for outreach"]]);
  assert.ok(queue().find(item => item.id === today)?.href.includes(today));
  assert.ok(queue().find(item => item.id === action)?.href.includes(action));
});

test("matching linked tasks appear once and completion resolves the matching next action only", t => {
  const { store, opportunity, task, queue } = fixture(t);
  const id = opportunity({ next_action: "Send follow-up email", next_action_date: "2027-01-05" });
  const matching = task({ opportunity_id: id, title: "send follow-up email", due_date: "2027-01-05" });
  const unrelated = task({ opportunity_id: id, title: "Review notes", due_date: "2027-01-05" });
  assert.equal(queue().filter(item => item.kind === "next_action").length, 0);
  store.completeTask(unrelated, true);
  assert.equal(store.get(id)?.next_action, "Send follow-up email");
  store.completeTask(matching, true);
  assert.equal(store.get(id)?.next_action, null);
  assert.equal(queue().length, 0);
  store.update(id, { ...store.get(id)!, next_action: "Send follow-up email", next_action_date: "2027-01-05" });
  store.completeTask(matching, true);
  assert.equal(store.get(id)?.next_action, "Send follow-up email");
  assert.equal(store.clearNextAction(id, "Changed title", "2027-01-05"), false);
  assert.equal(store.clearNextAction(id, "Send follow-up email", "2027-01-04"), false);
  assert.equal(store.get(id)?.next_action, "Send follow-up email");
  assert.equal(store.clearNextAction(id, "Send follow-up email", "2027-01-05"), true);
  assert.equal(store.get(id)?.next_action_date, null);
});

test("sent follow-ups and replies resolve old email reminders but preserve newer or custom plans", t => {
  const { store, opportunity } = fixture(t);
  const id = opportunity();
  store.logActivity(id, email);
  store.logActivity(id, { ...email, activity_type: "Reply received", occurred_at: "2027-01-03T14:00:00.000Z", follow_up_date: null });
  assert.equal(store.get(id)?.next_action_date, "2027-01-11");
  store.logActivity(id, { ...email, activity_type: "Follow-up email sent", occurred_at: "2027-01-11T14:00:00.000Z", follow_up_date: null });
  assert.equal(store.get(id)?.next_action, null);
  store.logActivity(id, { ...email, activity_type: "Follow-up email sent", occurred_at: "2027-01-12T14:00:00.000Z", follow_up_date: "2027-01-19" });
  assert.equal(store.get(id)?.next_action_date, "2027-01-19");
  store.logActivity(id, { ...email, activity_type: "Reply received", occurred_at: "2027-01-13T14:00:00.000Z", follow_up_date: null });
  assert.equal(store.get(id)?.next_action_date, null);
  store.update(id, { ...store.get(id)!, next_action: "Review a paper", next_action_date: "2027-01-20" });
  store.logActivity(id, { ...email, activity_type: "Meeting scheduled", occurred_at: "2027-01-14T14:00:00.000Z", follow_up_date: null });
  assert.equal(store.get(id)?.next_action, "Review a paper");
});

test("queue calendar boundaries use New York dates and calendar days rather than elapsed hours", () => {
  assert.equal(todayInNewYork(new Date("2027-01-05T04:59:00Z")), "2027-01-04");
  assert.equal(todayInNewYork(new Date("2027-01-05T05:00:00Z")), "2027-01-05");
  assert.equal(todayInNewYork(new Date("2027-07-05T03:59:00Z")), "2027-07-04");
  assert.equal(addCalendarDays("2027-03-07", 7), "2027-03-14");
  assert.equal(addCalendarDays("2026-12-28", 7), "2027-01-04");
});

test("task schema upgrades keep existing opportunities and activity records", t => {
  const { filename, store, opportunity } = fixture(t);
  const id = opportunity({ notes: "Existing record" }); store.logActivity(id, email);
  const old = new DatabaseSync(filename); old.exec("DROP TABLE tasks"); old.close();
  const upgraded = openOpportunityStore(filename);
  try {
    assert.equal(upgraded.get(id)?.notes, "Existing record");
    assert.equal(upgraded.activities(id).length, 1);
    assert.deepEqual(upgraded.tasks(), []);
    const taskId = upgraded.createTask(parseTask({ title: "Resume", category: "Portfolio / Projects", priority: "high" }).data!);
    assert.equal(upgraded.getTask(taskId)?.title, "Resume");
  } finally { upgraded.close(); }
});
