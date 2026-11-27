import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDistance, clipTimelineSpan, shiftTimeline, timelineBarSpan, timelineRows, timelineWindow, validCalendarDate } from "../src/lib/timeline-model.ts";
import type { Task } from "../src/lib/task-model.ts";
import type { GoalView } from "../src/lib/goal-model.ts";

test("timeline windows pan by days, weeks, and calendar months across leap years", () => {
  assert.deepEqual(timelineWindow("2027-03-07", "days"), { start: "2027-03-07", end: "2027-03-21" });
  assert.equal(calendarDistance("2027-03-07", "2027-03-21"), 14);
  assert.deepEqual(timelineWindow("2027-01-31", "months"), { start: "2027-01-01", end: "2027-07-01" });
  assert.equal(calendarDistance("2028-02-01", "2028-03-01"), 29);
  assert.equal(shiftTimeline("2027-01-31", "months", 1), "2027-07-01");
  assert.equal(shiftTimeline("2027-01-04", "weeks", -1), "2026-11-09");
  assert.equal(validCalendarDate("2027-02-29"), false);
  assert.equal(validCalendarDate("2028-02-29"), true);
  assert.throws(() => timelineWindow("bad", "days"));
});

test("timeline clips inclusive date spans without losing final days or extending outside the window", () => {
  const window = { start: "2027-01-04", end: "2027-01-18" };
  assert.deepEqual(clipTimelineSpan({ start: "2027-01-04", end: "2027-01-04" }, window), { offset: 0, days: 1, before: false, after: false });
  assert.deepEqual(clipTimelineSpan({ start: "2027-01-01", end: "2027-01-20" }, window), { offset: 0, days: 14, before: true, after: true });
  assert.deepEqual(clipTimelineSpan({ start: "2027-01-17", end: "2027-01-17" }, window), { offset: 13, days: 1, before: false, after: false });
  assert.equal(clipTimelineSpan({ start: "2027-01-18", end: "2027-01-19" }, window), null);
  assert.equal(clipTimelineSpan({ start: "2027-01-01", end: "2027-01-03" }, window), null);
});

test("task markers, unscheduled work, and goal progress retain their saved meaning", () => {
  const base: Task = { id: "task", title: "Resume", description: null, category: "Administration", priority: "medium", opportunity_id: null, start_date: null, due_date: "2027-01-05", completed_at: null, created_at: "2027-01-01T00:00:00Z", updated_at: "2027-01-01T00:00:00Z" };
  const goal: GoalView = { id: "goal", title: "Research outreach", metric_type: "research_contacts", target_count: 80, start_date: "2027-01-01", end_date: "2027-03-31", status: "active", created_at: base.created_at, updated_at: base.updated_at, current: 12, percentage: 15, completed: false };
  const { rows, unscheduled } = timelineRows([base, { ...base, id: "range", start_date: "2027-01-02" }, { ...base, id: "undated", due_date: null }, { ...base, id: "start-only", start_date: "2027-01-01", due_date: null }], [goal]);
  assert.equal(rows.length, 3); assert.equal(unscheduled.length, 2);
  assert.equal(rows.find(row => row.id === "task")?.marker, true);
  assert.equal(rows.find(row => row.id === "range")?.marker, false);
  const goalRow = rows.find(row => row.id === "goal")!;
  assert.equal(goalRow.progress, 15); assert.equal(goalRow.current, 12);
  clipTimelineSpan(goalRow, timelineWindow("2027-02-01", "days"));
  assert.equal(goalRow.progress, 15);
  assert.ok(goalRow.href.includes("goal=goal"));
});

test("upcoming deadlines stretch from today through the due date", () => {
  const today = "2026-11-26";
  const window = timelineWindow(today, "weeks");
  const essay = {
    id: "essay", kind: "supplement" as const, title: "Supplement", start: "2026-12-11", end: "2026-12-11",
    marker: true, completed: false, paused: false, href: "/admissions",
  };
  assert.deepEqual(timelineBarSpan(essay, today, window), { offset: 0, days: 16, before: false, after: false });
  assert.deepEqual(timelineBarSpan(essay, today, timelineWindow("2026-12-03", "weeks")), {
    offset: 0, days: 9, before: true, after: false,
  });
  assert.equal(timelineBarSpan({ ...essay, completed: true }, today, window)?.days, 1);
  assert.equal(timelineBarSpan(essay, "2026-12-12", window)?.days, 1);
  assert.equal(timelineBarSpan({ ...essay, marker: false, start: "2026-12-07" }, today, window)?.offset, 11);
});
