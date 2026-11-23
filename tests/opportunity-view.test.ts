import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parseOpportunity } from "../src/lib/opportunity-model.ts";
import { defaultOpportunityFilters, selectOpportunities } from "../src/lib/opportunity-view.ts";
import { buildActionQueue } from "../src/lib/action-queue.ts";
import { metricProgress } from "../src/lib/goal-model.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-search-")), filename = join(directory, "opportunities.sqlite");
  const store = openOpportunityStore(filename);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const create = (raw: Record<string, unknown> = {}) => store.create(parseOpportunity({ organization_name: "Test Lab", title: "Summer research", type: "Research", status: "Saved", ...raw }).data!);
  return { store, create, filename };
}
test("search combines organization, contact, title, focus, pipeline, and inclusive deadline filters", t => {
  const { store, create } = fixture(t);
  const first = create({ organization_name: "Alpha Lab", contact_name: "Professor Example", technical_focus: "Distributed systems", priority: "high", deadline: "2027-01-11" });
  create({ organization_name: "Beta Startup", type: "Startup", title: "Frontend internship", status: "Responded", deadline: "2027-01-12" });
  create({ organization_name: "Old Lab", deadline: "2027-01-03" });
  const rows = store.list();
  for (const search of ["alpha", "EXAMPLE", "distributed", "summer"]) assert.ok(selectOpportunities(rows, { ...defaultOpportunityFilters, search }, "2027-01-04").some(item => item.id === first));
  assert.equal(selectOpportunities(rows, { ...defaultOpportunityFilters, search: "no match" }, "2027-01-04").length, 0);
  assert.deepEqual(selectOpportunities(rows, { ...defaultOpportunityFilters, type: "Research", priority: "high", status: "Saved", deadline: "upcoming" }, "2027-01-04").map(item => item.id), [first]);
  assert.equal(selectOpportunities(rows, { ...defaultOpportunityFilters, deadline: "overdue" }, "2027-01-04")[0].organization_name, "Old Lab");
  assert.equal(selectOpportunities(rows, { ...defaultOpportunityFilters, sort: "last_activity" }, "2027-01-04", { [first]: "2027-01-04T14:00:00Z" })[0].id, first);
  assert.equal(selectOpportunities(rows, { ...defaultOpportunityFilters, sort: "priority" }, "2027-01-04")[0].id, first);
});
test("archiving is reversible, keeps history and totals, and removes opportunity queue entries", t => {
  const { store, create } = fixture(t);
  const id = create();
  store.logActivity(id, { activity_type: "Initial email sent", occurred_at: "2027-01-04T14:00:00.000Z", notes: "Preserve me", follow_up_date: "2027-01-11" });
  store.archive(id, true);
  const archivedAt = store.get(id)!.archived_at;
  store.archive(id, true); assert.equal(store.get(id)?.archived_at, archivedAt);
  assert.equal(selectOpportunities(store.list(), defaultOpportunityFilters, "2027-01-04").length, 0);
  assert.equal(selectOpportunities(store.list(), { ...defaultOpportunityFilters, archive: "archived" }, "2027-01-04").length, 1);
  assert.equal(selectOpportunities(store.list(), { ...defaultOpportunityFilters, archive: "all" }, "2027-01-04").length, 1);
  assert.equal(buildActionQueue(store.list(), [], store.allActivities(), "2027-01-04").length, 0);
  assert.equal(store.activities(id)[0].notes, "Preserve me");
  assert.equal(metricProgress("research_contacts", { opportunities: store.list(), tasks: [], activities: store.allActivities() }, "2027-01-01", "2027-01-31", new Date("2027-02-01")), 1);
  store.archive(id, false); assert.equal(store.get(id)?.archived_at, null);
  assert.equal(buildActionQueue(store.list(), [], store.allActivities(), "2027-01-04").length, 1);
});
test("archive schema migration preserves existing records and activity", t => {
  const { store, create, filename } = fixture(t);
  const id = create({ notes: "Existing record" });
  store.logActivity(id, { activity_type: "General note", occurred_at: "2027-01-04T14:00:00.000Z", notes: "Existing activity", follow_up_date: null });
  const old = new DatabaseSync(filename); old.exec("ALTER TABLE opportunities DROP COLUMN archived_at"); old.close();
  const upgraded = openOpportunityStore(filename);
  try { assert.equal(upgraded.get(id)?.notes, "Existing record"); assert.equal(upgraded.get(id)?.archived_at, null); assert.equal(upgraded.activities(id)[0].notes, "Existing activity"); upgraded.archive(id, true); assert.ok(upgraded.get(id)?.archived_at); } finally { upgraded.close(); }
});
