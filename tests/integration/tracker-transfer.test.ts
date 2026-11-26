import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openOpportunityStore } from "../../src/lib/opportunities.ts";
import { parseOpportunity } from "../../src/lib/opportunity-model.ts";
import { postgresTrackerStore } from "../../src/lib/tracker-postgres.ts";
import { importTrackerSqlite, restoreTrackerSqlite } from "../../src/lib/tracker-transfer.ts";
import { withTestPostgres } from "./postgres-fixture.ts";

test("SQLite import preserves all tracker tables, upgrades copies, and rolls back failures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-import-test-"));
  const source = join(directory, "source.sqlite");
  try {
    const sqlite = openOpportunityStore(source);
    const id = sqlite.create(parseOpportunity({
      organization_name: "Café Lab", title: "Research", type: "Research", status: "Saved",
      contact_email: "professor@example.com", deadline: "2027-11-07", notes: "Line 1\nLine 2",
    }).data!);
    sqlite.logActivity(id, {
      activity_type: "Reply received", occurred_at: "2027-11-07T05:30:00.000Z", notes: "Résumé requested",
      positive_response: true, follow_up_date: null,
    });
    sqlite.createTask({
      opportunity_id: id, title: "Send résumé", description: null, category: "Research",
      priority: "high", start_date: null, due_date: "2027-11-09",
    });
    sqlite.createGoal({
      title: "Research replies", metric_type: "positive_responses", target_count: 2,
      start_date: "2027-11-07", end_date: "2027-11-10", status: "paused",
    });
    sqlite.setFollowUpDays(11);
    const expected = {
      opportunities: sqlite.list(), activities: sqlite.allActivities(), tasks: sqlite.tasks(),
      goals: sqlite.goals(), preferences: sqlite.preferences(),
    };
    sqlite.close();
    const legacy = new DatabaseSync(source);
    try {
      legacy.exec("ALTER TABLE opportunities DROP COLUMN archived_at");
    } finally {
      legacy.close();
    }

    await withTestPostgres(async pool => {
      const postgres = postgresTrackerStore(pool);
      await pool.query("ALTER TABLE tracker.goals ADD CONSTRAINT test_reject_goal CHECK (title <> 'Research replies')");
      await assert.rejects(importTrackerSqlite(source, pool), { code: "23514" });
      assert.deepEqual(await postgres.list(), []);
      assert.deepEqual(await postgres.allActivities(), []);
      assert.deepEqual(await postgres.tasks(), []);
      await pool.query("ALTER TABLE tracker.goals DROP CONSTRAINT test_reject_goal");

      assert.deepEqual(await importTrackerSqlite(source, pool),
        { opportunities: 1, activities: 1, tasks: 1, goals: 1, preferences: 1 });
      assert.deepEqual(await postgres.list(), expected.opportunities);
      assert.deepEqual(await postgres.allActivities(), expected.activities);
      assert.deepEqual(await postgres.tasks(), expected.tasks);
      assert.deepEqual(await postgres.goals(), expected.goals);
      assert.deepEqual(await postgres.preferences(), expected.preferences);
      await assert.rejects(importTrackerSqlite(source, pool), /must all be empty/);
    });

    const unchanged = new DatabaseSync(source, { readOnly: true });
    try {
      assert.equal(unchanged.prepare("PRAGMA table_info(opportunities)").all().some(row => row.name === "archived_at"), false);
    } finally {
      unchanged.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reverse transfer publishes a private SQLite file with fresh Postgres writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-restore-test-"));
  const source = join(directory, "before-cutover.sqlite");
  const output = join(directory, "after-cutover.sqlite");
  try {
    const original = openOpportunityStore(source);
    const id = original.create(parseOpportunity({
      organization_name: "Fixture lab", title: "Research", type: "Research", status: "Saved",
    }).data!);
    original.close();

    await withTestPostgres(async pool => {
      await importTrackerSqlite(source, pool);
      const postgres = postgresTrackerStore(pool);
      const task = await postgres.createTask({
        opportunity_id: id, title: "Created after cutover", category: "Research",
        description: null, priority: "medium", start_date: null, due_date: "2027-03-15",
      });
      await postgres.archive(id, true);
      await postgres.completeTask(task, true);
      await postgres.setFollowUpDays(14);
      assert.deepEqual(await restoreTrackerSqlite(pool, output),
        { opportunities: 1, activities: 0, tasks: 1, goals: 0, preferences: 1 });
      assert.equal(statSync(output).mode & 0o777, 0o600);
      await assert.rejects(restoreTrackerSqlite(pool, source), { code: "EEXIST" });

      const restored = openOpportunityStore(output);
      try {
        assert.deepEqual(restored.get(id), await postgres.get(id));
        assert.deepEqual(restored.getTask(task), await postgres.getTask(task));
        assert.equal(restored.preferences().follow_up_days, 14);
      } finally {
        restored.close();
      }
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
