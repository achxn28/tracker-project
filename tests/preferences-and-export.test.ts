import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { parsePreferences } from "../src/lib/preferences-model.ts";
import { suggestedFollowUp } from "../src/lib/activity-model.ts";
import { toCsv } from "../src/lib/csv.ts";

test("preferences validate themes and bounded whole-number intervals", () => {
  assert.equal(parsePreferences({ theme: "dark", follow_up_days: "14" }).data?.follow_up_days, 14);
  for (const change of [{ theme: "unknown" }, { follow_up_days: "0" }, { follow_up_days: "366" }, { follow_up_days: "1.5" }, { follow_up_days: "bad" }]) assert.ok(parsePreferences({ theme: "light", follow_up_days: "7", ...change }).errors);
  assert.equal(suggestedFollowUp("2027-03-07T09:00", 14), "2027-03-21");
});

test("follow-up preferences persist without requiring default rows or rewriting records", () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-preferences-")), filename = join(directory, "opportunities.sqlite");
  let store = openOpportunityStore(filename);
  try {
    assert.equal(store.preferences().follow_up_days, 7);
    store.setFollowUpDays(14);
    assert.equal(store.preferences().follow_up_days, 14);
    assert.throws(() => store.setFollowUpDays(0));
    assert.equal(store.preferences().follow_up_days, 14);
    store.close(); store = openOpportunityStore(filename);
    assert.equal(store.preferences().follow_up_days, 14);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("CSV preserves quoted commas, multiline Unicode text, empty values, and stable headers", () => {
  assert.equal(toCsv(["name", "notes", "count", "empty"], [{ name: 'Example, "Lab"', notes: "研究\nSecond line", count: 2, empty: null }]), '"name","notes","count","empty"\r\n"Example, ""Lab""","研究\nSecond line","2",""\r\n');
  assert.equal(toCsv(["id", "name"], []), '"id","name"\r\n');
});

test("CSV exports text instead of spreadsheet formulas, including leading whitespace", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "\t=1+1", "  +formula", "\n=1+1"]) {
    assert.equal(toCsv(["value"], [{ value }]), `"value"\r\n"'${value}"\r\n`);
  }
  assert.equal(toCsv(["value"], [{ value: "ordinary text" }]), '"value"\r\n"ordinary text"\r\n');
});
