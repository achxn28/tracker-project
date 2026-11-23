import { test } from "node:test";
import assert from "node:assert/strict";
import { taskUrgency } from "../src/lib/task-urgency.ts";

test("task colors progress from green to red at calendar-day boundaries", () => {
  const today = "2027-03-07";
  for (const [due, tone, label] of [
    ["2027-03-15", "green", "8 days left"],
    ["2027-03-14", "yellow", "7 days left"],
    ["2027-03-11", "yellow", "4 days left"],
    ["2027-03-10", "amber", "3 days left"],
    ["2027-03-08", "amber", "Due tomorrow"],
    ["2027-03-07", "red", "Due today"],
    ["2027-03-06", "red", "1 day overdue"],
    ["2027-03-05", "red", "2 days overdue"],
  ]) assert.deepEqual(taskUrgency(due, false, today), { tone, label });
  assert.equal(taskUrgency("2028-03-01", false, "2028-02-27").label, "3 days left");
  assert.equal(taskUrgency("2027-01-01", false, "2026-12-31").label, "Due tomorrow");
});

test("completed and undated tasks keep neutral surfaces", () => {
  assert.deepEqual(taskUrgency("2026-01-01", true, "2027-01-01"), { tone: "neutral", label: "Completed" });
  assert.deepEqual(taskUrgency(null, false, "2027-01-01"), { tone: "neutral", label: "No due date" });
  assert.equal(taskUrgency("invalid", false, "2027-01-01").tone, "neutral");
});
