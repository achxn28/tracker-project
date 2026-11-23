import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { arrangements, opportunityTypes, optionalFields, outcomes, priorities, statuses, type Opportunity, type OpportunityInput } from "./opportunity-model.ts";

const columns = ["organization_name", "title", "type", "status", "priority", "work_arrangement", ...optionalFields, "closed_outcome"] as const;
const sqlOptions = (values: readonly string[]) => values.map(value => `'${value}'`).join(", ");

export function openOpportunityStore(filename: string) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY NOT NULL,
      organization_name TEXT NOT NULL CHECK (length(trim(organization_name)) > 0),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      type TEXT NOT NULL CHECK (type IN (${sqlOptions(opportunityTypes)})),
      status TEXT NOT NULL CHECK (status IN (${sqlOptions(statuses)})),
      priority TEXT NOT NULL CHECK (priority IN (${sqlOptions(priorities)})),
      work_arrangement TEXT NOT NULL CHECK (work_arrangement IN (${sqlOptions(arrangements)})),
      ${optionalFields.map(field => `${field} TEXT`).join(",\n")},
      closed_outcome TEXT CHECK (closed_outcome IN (${sqlOptions(outcomes)})),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (closed_outcome IS NULL OR status = 'Closed')
    ) STRICT;
  `);
  return {
    list: () => db.prepare("SELECT * FROM opportunities ORDER BY created_at DESC, id DESC").all().map(row => ({ ...row })) as Opportunity[],
    get(id: string) {
      const row = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
      return row ? { ...row } as Opportunity : undefined;
    },
    create(data: OpportunityInput) {
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      db.prepare(`INSERT INTO opportunities (id, ${columns.join(", ")}, created_at, updated_at) VALUES (?, ${columns.map(() => "?").join(", ")}, ?, ?)`)
        .run(id, ...columns.map(key => data[key]), timestamp, timestamp);
      return id;
    },
    update(id: string, data: OpportunityInput) {
      return db.prepare(`UPDATE opportunities SET ${columns.map(key => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
        .run(...columns.map(key => data[key]), new Date().toISOString(), id).changes > 0;
    },
    delete: (id: string) => db.prepare("DELETE FROM opportunities WHERE id = ?").run(id).changes > 0,
    close: () => db.close(),
  };
}

export function withOpportunities<T>(operation: (store: ReturnType<typeof openOpportunityStore>) => T): T {
  const store = openOpportunityStore(process.env.OPPORTUNITY_DB_PATH || join(process.cwd(), "data", "opportunities.sqlite"));
  try { return operation(store); } finally { store.close(); }
}
