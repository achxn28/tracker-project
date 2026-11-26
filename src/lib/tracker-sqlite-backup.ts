import "server-only";
import { chmodSync, linkSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export function checkTrackerSqlite(db: DatabaseSync) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error("SQLite integrity check failed.");
  }
  if (db.prepare("PRAGMA foreign_key_check").get()) throw new Error("SQLite contains a broken record link.");
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'opportunities'").get()) {
    throw new Error("This file is missing the tracker opportunities table.");
  }
}

export async function writeNewSqliteFile(destination: string, write: (temporaryFile: string) => Promise<void>) {
  const output = resolve(destination);
  const directory = mkdtempSync(join(dirname(output), ".tracker-sqlite-"));
  try {
    const temporaryFile = join(directory, "tracker.sqlite");
    await write(temporaryFile);
    chmodSync(temporaryFile, 0o600);
    // Publish a complete file atomically and reject an existing destination.
    linkSync(temporaryFile, output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function backupTrackerSqlite(source: string, destination: string) {
  const db = new DatabaseSync(resolve(source), { readOnly: true });
  try {
    await writeNewSqliteFile(destination, async temporaryFile => {
      await backup(db, temporaryFile);
      const copy = new DatabaseSync(temporaryFile, { readOnly: true });
      try {
        checkTrackerSqlite(copy);
      } finally {
        copy.close();
      }
    });
  } finally {
    db.close();
  }
}
