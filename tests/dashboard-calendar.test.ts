import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpportunity, type Opportunity } from "../src/lib/opportunity-model.ts";
import { calendarDeadlines, calendarMonth, shiftCalendarMonth } from "../src/lib/dashboard-calendar.ts";

test("dashboard calendar uses complete Monday-first weeks across month and leap-year boundaries", () => {
  const february = calendarMonth("2028-02-14");
  assert.equal(february[0], "2028-01-31");
  assert.equal(february.at(-1), "2028-03-05");
  assert.ok(february.includes("2028-02-29"));
  assert.equal(february.length % 7, 0);
  const november = calendarMonth("2026-11-23");
  assert.equal(november.length, 42);
  assert.equal(november[0], "2026-10-26");
  assert.equal(november.at(-1), "2026-12-06");
  assert.equal(shiftCalendarMonth("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftCalendarMonth("2027-03-31", -1), "2027-02-01");
});

test("calendar lists pending dated tasks and unfinished active goals with working links", () => {
  const tasks = [
    { id: "task", title: "Read paper", due_date: "2027-03-01", completed_at: null },
    { id: "done", title: "Done", due_date: "2027-03-01", completed_at: "2027-02-27T12:00:00Z" },
    { id: "undated", title: "Undated", due_date: null, completed_at: null },
  ];
  const goal = { id: "goal", title: "Outreach", end_date: "2027-02-28", status: "active" as const, completed: false };
  const events = calendarDeadlines(tasks, [goal, { ...goal, id: "paused", status: "paused" }, { ...goal, id: "complete", completed: true }]);
  assert.deepEqual(events.map(item => item.id), ["goal", "task"]);
  assert.equal(events[0].href, "/goals?goal=goal#goal-goal");
  assert.equal(events[1].href, "/tasks?task=task#task-task");
  assert.equal(events[1].date, "2027-03-01");
});

test("calendar includes application deadlines and explicit follow-ups across the whole month", () => {
  const research = opportunity("research", { next_action: "Send follow-up email", next_action_date: "2027-03-20" });
  const application = opportunity("application", { type: "Formal Internship", deadline: "2027-03-25" });
  const custom = opportunity("custom", { next_action: "Prepare questions", next_action_date: "2027-02-28" });
  const events = calendarDeadlines([], [], [research, application, custom]);
  assert.deepEqual(events.map(item => [item.kind, item.date]), [["next_action", "2027-02-28"], ["follow_up", "2027-03-20"], ["application", "2027-03-25"]]);
  assert.equal(events[1].title, "Send follow-up email");
  assert.equal(events[1].context, "Example research");
  assert.equal(events[1].href, "/opportunities?opportunity=research");
  assert.equal(events[2].context, "Example application");
  assert.deepEqual(calendarDeadlines([], [], [opportunity("undated", { next_action: "Follow up" })]), []);
});

test("archived, closed, and submitted applications do not leave stale calendar reminders", () => {
  const base = { deadline: "2027-03-25", next_action: "Send follow-up email", next_action_date: "2027-03-20" };
  const archived = opportunity("archived", { ...base, archived_at: "2027-03-01T12:00:00Z" });
  const closed = opportunity("closed", { ...base, status: "Closed" });
  const submitted = opportunity("submitted", { deadline: "2027-03-25" });
  const laterStage = opportunity("responded", { deadline: "2027-03-25", status: "Responded" });
  assert.deepEqual(calendarDeadlines([], [], [archived, closed, submitted, laterStage], [{ opportunity_id: "submitted", activity_type: "Application submitted" }]), []);
  const stillPlanned = opportunity("submitted", base);
  assert.deepEqual(calendarDeadlines([], [], [stillPlanned], [{ opportunity_id: "submitted", activity_type: "Application submitted" }]).map(item => item.kind), ["follow_up"]);
});

test("matching pending linked tasks represent a planned next action only once", () => {
  const contact = opportunity("research", { next_action: "Send follow-up email", next_action_date: "2027-03-20" });
  const task = { id: "task", title: " send FOLLOW-UP email ", due_date: "2027-03-20", completed_at: null, opportunity_id: contact.id };
  assert.deepEqual(calendarDeadlines([task], [], [contact]).map(item => item.kind), ["task"]);
  assert.deepEqual(calendarDeadlines([{ ...task, opportunity_id: "other" }], [], [contact]).map(item => item.kind).sort(), ["follow_up", "task"]);
  assert.equal(calendarDeadlines([{ ...task, due_date: "2027-03-21" }], [], [contact]).length, 2);
  assert.deepEqual(calendarDeadlines([{ ...task, completed_at: "2027-03-19T12:00:00Z" }], [], [contact]).map(item => item.kind), ["follow_up"]);
  assert.deepEqual(calendarDeadlines([], [], [{ ...contact, next_action: null, next_action_date: null }]), []);
});

function opportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return { ...parseOpportunity({ organization_name: `Example ${id}`, title: "Summer research", type: "Research", status: "Saved" }).data!, id, archived_at: null, created_at: "2027-03-01T12:00:00Z", updated_at: "2027-03-01T12:00:00Z", ...overrides };
}
