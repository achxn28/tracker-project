import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildActionQueue } from "../src/lib/action-queue.ts";
import { scheduledSupplements, type AdmissionsData } from "../src/lib/admissions-model.ts";
import { completeSupplement, importAdmissions, readAdmissions, readAdmissionsGoalProgress, saveAdmissionsGoal, saveCollege, saveSupplement } from "../src/lib/admissions-store.ts";
import { calendarDeadlines } from "../src/lib/dashboard-calendar.ts";
import { timelineRows } from "../src/lib/timeline-model.ts";

test("Admissions edits update the correct schedule and survive reimport", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracker-admissions-"));
  const previousDir = process.env.TRACKER_ADMISSIONS_DIR;
  process.env.TRACKER_ADMISSIONS_DIR = dir;
  try {
    const seed: AdmissionsData = {
      colleges: [{
        id: "school", name: "Example University", round: "RD", deadline: "2027-01-01",
        submitted: false, docsUrl: null, supplementsUnknown: false,
      }],
      supplements: [{
        id: "essay", collegeId: "school", title: "Why this school", dueDate: "2026-12-21",
        prompt: "Why did you choose us?", wordLimit: 250, status: "Drafting", docsUrl: null,
      }],
    };
    importAdmissions(seed);
    assert.deepEqual(readAdmissions(), seed);
    saveAdmissionsGoal({ title: "Finish all supplements", start_date: "2026-11-26", end_date: "2026-12-24", status: "active" });
    assert.equal(readAdmissionsGoalProgress()?.current, 0);
    assert.equal(readAdmissionsGoalProgress()?.target_count, 1);
    saveCollege({ ...seed.colleges[0], deadline: "2027-01-03", submitted: true });
    const queue = (today: string) => buildActionQueue([], [], [], today, scheduledSupplements(readAdmissions()));
    assert.equal(queue("2026-12-13").length, 0);
    assert.deepEqual(queue("2026-12-14").map(({ kind, section }) => ({ kind, section })), [{ kind: "supplement", section: "Upcoming" }]);
    assert.equal(queue("2026-12-22")[0].section, "Overdue");

    saveSupplement({ ...seed.supplements[0], dueDate: "2026-12-23" });
    assert.equal(queue("2026-12-22")[0].date, "2026-12-23");
    assert.equal(completeSupplement("essay"), true);
    assert.equal(completeSupplement("unknown"), false);
    assert.equal(queue("2026-12-22").length, 0);
    assert.equal(readAdmissionsGoalProgress()?.current, 1);
    assert.equal(readAdmissionsGoalProgress()?.completed, true);
    assert.equal(readAdmissionsGoalProgress([
      ...readAdmissions().supplements,
      { ...seed.supplements[0], id: "undated", dueDate: null },
    ])?.completed, false);
    importAdmissions(seed);

    const data = readAdmissions();
    assert.equal(data.supplements.length, 1);
    const { rows } = timelineRows([], [], data);
    assert.deepEqual(rows.map(({ kind, start, end, href, completed }) => ({ kind, start, end, href, completed })), [
      { kind: "supplement", start: "2026-12-23", end: "2026-12-23", href: "/admissions?college=school#supplement-essay", completed: true },
    ]);
    const events = calendarDeadlines([], [], [], [], data.colleges);
    assert.deepEqual(events, [{
      id: "school", kind: "college", title: "Example University", date: "2027-01-03",
      href: "/admissions?college=school#college-school", context: "RD · Submitted",
    }]);
  } finally {
    if (previousDir === undefined) delete process.env.TRACKER_ADMISSIONS_DIR;
    else process.env.TRACKER_ADMISSIONS_DIR = previousDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
