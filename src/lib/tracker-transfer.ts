import "server-only";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";
import { openOpportunityStore, opportunityColumns } from "./opportunities.ts";
import { inTrackerTransaction } from "./tracker-postgres.ts";
import { backupTrackerSqlite, checkTrackerSqlite } from "./tracker-sqlite-backup.ts";

const fields = {
  opportunities: ["id", ...opportunityColumns, "archived_at", "created_at", "updated_at"],
  activities: ["id", "opportunity_id", "activity_type", "occurred_at", "notes", "positive_response", "created_at"],
  tasks: ["id", "opportunity_id", "title", "description", "category", "priority", "start_date", "due_date", "completed_at", "created_at", "updated_at"],
  goals: ["id", "title", "metric_type", "target_count", "start_date", "end_date", "status", "created_at", "updated_at"],
  preferences: ["id", "follow_up_days"],
} as const;
type Table = keyof typeof fields;
type Value = string | number | null;
type Row = Record<string, Value>;
type TrackerRows = Record<Table, Row[]>;
const tables = Object.keys(fields) as Table[];

export class TrackerTransferError extends Error {}

function sqliteRows(db: DatabaseSync): TrackerRows {
  checkTrackerSqlite(db);
  const schema = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  if (schema.length !== tables.length || schema.some(row => !tables.includes(row.name as Table))) {
    throw new TrackerTransferError("SQLite contains an unexpected table layout.");
  }

  const rows = {} as TrackerRows;
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.length !== fields[table].length || fields[table].some(field => !columns.some(column => column.name === field))) {
      throw new TrackerTransferError(`SQLite table ${table} has an unexpected layout.`);
    }
    rows[table] = db.prepare(`SELECT ${fields[table].join(", ")} FROM ${table}`).all() as Row[];
  }
  return rows;
}

async function postgresRows(client: PoolClient): Promise<TrackerRows> {
  const rows = {} as TrackerRows;
  for (const table of tables) {
    rows[table] = (await client.query<Row>(`SELECT ${fields[table].join(", ")} FROM tracker.${table}`)).rows;
  }
  return rows;
}

function verifyRows(expected: TrackerRows, actual: TrackerRows) {
  for (const table of tables) {
    const byId = new Map(actual[table].map(row => [row.id, row]));
    if (expected[table].length !== byId.size) throw new TrackerTransferError(`Row count differs for ${table}.`);
    for (const row of expected[table]) {
      const found = byId.get(row.id);
      if (!found || fields[table].some(field => found[field] !== row[field])) {
        throw new TrackerTransferError(`A copied row differs in ${table}.`);
      }
    }
  }
}

function counts(rows: TrackerRows) {
  return Object.fromEntries(tables.map(table => [table, rows[table].length])) as Record<Table, number>;
}

async function readSqliteCopy(source: string): Promise<TrackerRows> {
  const directory = mkdtempSync(join(tmpdir(), "tracker-import-"));
  try {
    const copy = join(directory, "source.sqlite");
    await backupTrackerSqlite(source, copy);
    // Allow the app's legacy SQLite upgrades to run on the private copy.
    openOpportunityStore(copy).close();
    const db = new DatabaseSync(copy, { readOnly: true });
    try {
      return sqliteRows(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function importTrackerSqlite(source: string, pool: Pool) {
  const rows = await readSqliteCopy(source);
  return inTrackerTransaction(pool, async client => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(`LOCK TABLE ${tables.map(table => `tracker.${table}`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
    for (const table of tables) {
      const result = await client.query(`SELECT 1 FROM tracker.${table} LIMIT 1`);
      if (result.rowCount) throw new TrackerTransferError("The Postgres tracker tables must all be empty before importing.");
    }
    for (const table of tables) {
      const columns = fields[table];
      const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");
      for (const row of rows[table]) {
        await client.query(`INSERT INTO tracker.${table} (${columns.join(", ")}) VALUES (${parameters})`, columns.map(column => row[column]));
      }
    }
    verifyRows(rows, await postgresRows(client));
    return counts(rows);
  });
}
