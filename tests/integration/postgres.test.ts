import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseOpportunity } from "../../src/lib/opportunity-model.ts";
import { postgresTrackerStore } from "../../src/lib/tracker-postgres.ts";
import { withTestPostgres } from "./postgres-fixture.ts";

test("Postgres preserves tracker dates, history, reminders, and foreign keys", async () => {
  await withTestPostgres(async pool => {
    const store = postgresTrackerStore(pool);
    const opportunity = parseOpportunity({
      organization_name: "Café Lab", title: "Research", type: "Research", status: "Saved",
      deadline: "2027-03-14", outreach_notes: "First line\nSecond line",
    }).data!;
    const id = await store.create(opportunity);
    assert.equal((await store.get(id))?.deadline, "2027-03-14");
    assert.equal((await store.get(id))?.organization_name, "Café Lab");
    await store.archive(id, true);
    assert.match((await store.get(id))!.archived_at!, /Z$/);
    await store.archive(id, false);
    assert.equal((await store.get(id))!.archived_at, null);

    await store.logActivity(id, {
      activity_type: "Initial email sent", occurred_at: "2027-03-14T14:00:00.000Z", notes: null, follow_up_date: "2027-03-21",
    });
    assert.equal((await store.get(id))?.status, "Contacted / Applied");
    await store.logActivity(id, {
      activity_type: "Reply received", occurred_at: "2027-03-13T14:00:00.000Z", notes: null, follow_up_date: null, positive_response: true,
    });
    assert.equal((await store.get(id))?.next_action_date, "2027-03-21");

    const task = await store.createTask({
      opportunity_id: id, title: "  SEND follow-up email  ", description: null, category: "Research",
      priority: "medium", start_date: null, due_date: "2027-03-21",
    });
    await Promise.all([store.completeTask(task, true), store.completeTask(task, true)]);
    const completed = (await store.getTask(task))!.completed_at;
    assert.match(completed!, /Z$/);
    assert.equal((await store.get(id))?.next_action, null);
    await store.completeTask(task, true);
    assert.equal((await store.getTask(task))?.completed_at, completed);

    assert.equal((await store.activities(id))[1]?.positive_response, 1);
    assert.equal((await store.outreachCounts()).research_contacts, 1);

    const goal = await store.createGoal({
      title: "Reply goal", metric_type: "positive_responses", target_count: Number.MAX_SAFE_INTEGER,
      start_date: "2027-03-13", end_date: "2027-03-21", status: "active",
    });
    assert.equal((await store.getGoal(goal))?.target_count, Number.MAX_SAFE_INTEGER);
    assert.deepEqual(await store.preferences(), { follow_up_days: 7 });
    await store.setFollowUpDays(9);
    assert.deepEqual(await store.preferences(), { follow_up_days: 9 });

    const closed = await store.create({ ...opportunity, status: "Closed", closed_outcome: "withdrawn" });
    await assert.rejects(store.logActivity(closed, {
      activity_type: "Initial email sent", occurred_at: "2027-03-14T14:00:00.000Z", notes: null, follow_up_date: "2027-03-21",
    }), /Reopen the opportunity/);
    assert.deepEqual(await store.activities(closed), []);

    await pool.query("ALTER TABLE tracker.opportunities ADD CHECK (status <> 'Responded') NOT VALID");
    await assert.rejects(store.logActivity(id, {
      activity_type: "Reply received", occurred_at: "2027-03-15T14:00:00.000Z", notes: null, follow_up_date: null,
    }), { code: "23514" });
    assert.equal((await store.activities(id)).length, 2);

    assert.equal(await store.delete(id), true);
    assert.deepEqual(await store.activities(id), []);
    assert.equal((await store.getTask(task))?.opportunity_id, null);
  });
});
