import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { backupTrackerSqlite } from "../src/lib/tracker-sqlite-backup.ts";

test("SQLite backup includes committed WAL data without replacing a destination", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-backup-test-"));
  const source = join(directory, "source.sqlite");
  const destination = join(directory, "backup.sqlite");
  openOpportunityStore(source).close();
  const live = new DatabaseSync(source);
  try {
    live.exec("PRAGMA journal_mode = WAL; INSERT INTO preferences VALUES (1, 12)");
    await backupTrackerSqlite(source, destination);
    assert.equal(statSync(destination).mode & 0o777, 0o600);

    live.exec("UPDATE preferences SET follow_up_days = 13");
    await assert.rejects(backupTrackerSqlite(source, destination), { code: "EEXIST" });
    const copy = openOpportunityStore(destination);
    try {
      assert.equal(copy.preferences().follow_up_days, 12);
    } finally {
      copy.close();
    }
  } finally {
    live.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
