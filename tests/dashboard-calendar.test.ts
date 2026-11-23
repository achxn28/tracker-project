import { test } from "node:test";
import assert from "node:assert/strict";
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
