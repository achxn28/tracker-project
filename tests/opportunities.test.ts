import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { displayDate, parseOpportunity, statusLabel } from "../src/lib/opportunity-model.ts";

const valid = { organization_name: "O'Connor Lab", title: "Systems research", type: "Research", status: "Saved" };
test("validate required fields, enums, URLs, email, and calendar dates", () => {
  assert.ok(parseOpportunity(valid).data);
  for (const change of [{ organization_name: " " }, { title: "" }, { type: "Unknown" }, { status: "Invented" }, { priority: "urgent" }, { contact_email: "bad" }, { website_url: "javascript:alert(1)" }, { deadline: "2027-02-29" }, { next_action_date: "not-a-date" }]) {
    assert.ok(parseOpportunity({ ...valid, ...change }).errors, JSON.stringify(change));
  }
  assert.ok(parseOpportunity({ ...valid, deadline: "2028-02-29" }).data);
  assert.equal(parseOpportunity({ ...valid, closed_outcome: "rejected" }).data?.closed_outcome, null);
  assert.equal(parseOpportunity({ ...valid, status: "Closed", closed_outcome: "rejected" }).data?.closed_outcome, "rejected");
  assert.ok(parseOpportunity({ ...valid, status: "Closed", closed_outcome: "other" }).errors);
});

test("CRUD preserves optional fields, isolates IDs, and survives a process restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-store-"));
  const filename = join(directory, "opportunities.sqlite");
  let store = openOpportunityStore(filename);
  try {
    assert.deepEqual(store.list(), []);
    const data = parseOpportunity({ ...valid, notes: "First line\nSecond line", deadline: "2027-03-31", website_url: "https://example.com" }).data!;
    const id = store.create(data);
    const second = store.create({ ...data, organization_name: "Another lab" });
    const created = store.get(id)!;
    assert.equal(Object.getPrototypeOf(created), Object.prototype);
    assert.equal(Object.getPrototypeOf(store.list()[0]), Object.prototype);
    assert.equal(created.organization_name, "O'Connor Lab");
    assert.equal(created.notes, data.notes);
    assert.equal(store.get("' OR 1=1 --"), undefined);
    assert.equal(store.update("missing", data), false);
    assert.equal(store.update(id, { ...data, status: "Closed", closed_outcome: "withdrawn" }), true);
    assert.equal(store.get(id)?.created_at, created.created_at);
    store.close();
    const moduleUrl = new URL("../src/lib/opportunities.ts", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import {openOpportunityStore} from ${JSON.stringify(moduleUrl)}; const db=openOpportunityStore(${JSON.stringify(filename)}); console.log(JSON.stringify(db.get(${JSON.stringify(id)}))); db.close();`], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).closed_outcome, "withdrawn");
    store = openOpportunityStore(filename);
    assert.equal(store.list().length, 2);
    assert.equal(store.delete(id), true);
    assert.equal(store.delete(id), false);
    assert.equal(store.get(second)?.organization_name, "Another lab");
    assert.equal(store.list().length, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("date-only values and pipeline labels use recruiting terminology", () => {
  assert.equal(displayDate("2027-03-31"), "Mar 31, 2027");
  assert.equal(statusLabel("Contacted / Applied", "Formal Internship"), "Submitted");
  assert.equal(statusLabel("Contacted / Applied", "Research"), "Contacted");
});
