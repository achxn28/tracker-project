import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { arrangements, opportunityTypes, optionalFields, outcomes, priorities, statuses, type Opportunity, type OpportunityInput } from "./opportunity-model.ts";
import { activityTypes, pipelineAfterActivity, type Activity, type ActivityInput } from "./activity-model.ts";

const columns = ["organization_name", "title", "type", "status", "priority", "work_arrangement", ...optionalFields, "closed_outcome"] as const;
const sqlOptions = (values: readonly string[]) => values.map(value => `'${value}'`).join(", ");

export function openOpportunityStore(filename: string) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
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
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY NOT NULL,
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK (activity_type IN (${sqlOptions(activityTypes)})),
      occurred_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS activities_opportunity_time ON activities(opportunity_id, occurred_at DESC);
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
    activities: (id: string) => db.prepare("SELECT * FROM activities WHERE opportunity_id = ? ORDER BY occurred_at DESC, created_at DESC, id DESC").all(id).map(row => ({ ...row })) as Activity[],
    logActivity(id: string, data: ActivityInput) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const opportunity = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id) as Opportunity | undefined;
        if (!opportunity) throw new Error("Opportunity not found");
        if (data.follow_up_date && opportunity.status === "Closed") throw new Error("Reopen the opportunity before scheduling a follow-up");
        const latest = db.prepare("SELECT MAX(occurred_at) AS time FROM activities WHERE opportunity_id = ? AND activity_type NOT IN ('General note', 'Follow-up email sent')").get(id)?.time as string | null;
        const stage = !latest || data.occurred_at >= latest ? pipelineAfterActivity(opportunity, data.activity_type)
          : { status: opportunity.status, closed_outcome: opportunity.closed_outcome };
        const timestamp = new Date().toISOString();
        const activityId = randomUUID();
        db.prepare("INSERT INTO activities (id, opportunity_id, activity_type, occurred_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(activityId, id, data.activity_type, data.occurred_at, data.notes, timestamp);
        db.prepare("UPDATE opportunities SET status = ?, closed_outcome = ?, next_action = ?, next_action_date = ?, updated_at = ? WHERE id = ?")
          .run(stage.status, stage.closed_outcome, data.follow_up_date ? "Send follow-up email" : opportunity.next_action,
            data.follow_up_date ?? opportunity.next_action_date, timestamp, id);
        db.exec("COMMIT");
        return activityId;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    outreachCounts() {
      return { ...db.prepare(`SELECT
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Initial email sent' AND o.type = 'Research' THEN o.id END) AS research_contacts,
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Initial email sent' AND o.type = 'Startup' THEN o.id END) AS startup_contacts,
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Application submitted' AND o.type = 'Formal Internship' THEN o.id END) AS formal_applications
        FROM opportunities o JOIN activities a ON a.opportunity_id = o.id`).get() } as { research_contacts: number; startup_contacts: number; formal_applications: number };
    },
    close: () => db.close(),
  };
}

export function withOpportunities<T>(operation: (store: ReturnType<typeof openOpportunityStore>) => T): T {
  const store = openOpportunityStore(process.env.OPPORTUNITY_DB_PATH || join(process.cwd(), "data", "opportunities.sqlite"));
  try { return operation(store); } finally { store.close(); }
}
