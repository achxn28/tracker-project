import "server-only";
import { isOpenResearchOpportunity } from "./gmail-reply-matcher.ts";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { opportunityAfterActivity, type Activity } from "./activity-model.ts";
import type { Goal } from "./goal-model.ts";
import { opportunityColumns } from "./opportunities.ts";
import type { Opportunity } from "./opportunity-model.ts";
import type { Task } from "./task-model.ts";
import type { TrackerStore } from "./tracker-store.ts";

export function createTrackerPool(connection: string, caFile?: string): Pool {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error("Set TRACKER_DATABASE_URL to a Postgres connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Set TRACKER_DATABASE_URL to a Postgres connection URL.");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const sslMode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  if (url.search || (sslMode !== null && sslMode !== "verify-full" && !(local && sslMode === "disable"))) {
    throw new Error("Use a plain Postgres URL with certificate verification for remote connections.");
  }
  const ssl = !local || sslMode === "verify-full"
    ? { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}) }
    : false;
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    types: {
      getTypeParser(oid, format) {
        const parser = pg.types.getTypeParser(oid, format);
        if (format !== "binary" && oid === pg.types.builtins.DATE) return (value: string) => value;
        if (format !== "binary" && oid === pg.types.builtins.TIMESTAMPTZ) {
          return (value: string) => (parser(value) as Date).toISOString();
        }
        if (format !== "binary" && oid === pg.types.builtins.INT8) {
          return (value: string) => {
            const number = Number(value);
            if (!Number.isSafeInteger(number)) throw new Error("Postgres returned an integer outside the tracker range.");
            return number;
          };
        }
        return parser;
      },
    },
  });
  pool.on("error", () => console.error("An idle tracker Postgres connection was lost."));
  return pool;
}

export async function inTrackerTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  start = "BEGIN",
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query(start);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

const taskColumns = ["opportunity_id", "title", "description", "category", "priority", "start_date", "due_date"] as const;
const goalColumns = ["title", "metric_type", "target_count", "start_date", "end_date", "status"] as const;
type Table = "opportunities" | "tasks" | "goals";

export function postgresTrackerStore(pool: Pool) {
  async function addRow<K extends string>(table: Table, columns: readonly K[], data: Record<K, unknown>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const names = ["id", ...columns, "created_at", "updated_at"];
    await pool.query(`INSERT INTO tracker.${table} (${names.join(", ")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
      [id, ...columns.map(key => data[key]), now, now]);
    return id;
  }
  async function updateRow<K extends string>(table: Table, id: string, columns: readonly K[], data: Record<K, unknown>) {
    const names = [...columns, "updated_at"];
    const result = await pool.query(`UPDATE tracker.${table} SET ${names.map((name, index) => `${name} = $${index + 1}`).join(", ")} WHERE id = $${names.length + 1}`,
      [...columns.map(key => data[key]), new Date().toISOString(), id]);
    return result.rowCount === 1;
  }
  async function removeRow(table: Table, id: string) {
    return (await pool.query(`DELETE FROM tracker.${table} WHERE id = $1`, [id])).rowCount === 1;
  }

  return {
    async preferences() {
      return (await pool.query<{ follow_up_days: number }>("SELECT follow_up_days FROM tracker.preferences WHERE id = 1")).rows[0]
        ?? { follow_up_days: 7 };
    },
    async setFollowUpDays(days) {
      await pool.query("INSERT INTO tracker.preferences (id, follow_up_days) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET follow_up_days = excluded.follow_up_days", [days]);
    },
    async list() {
      return (await pool.query<Opportunity>("SELECT * FROM tracker.opportunities ORDER BY created_at DESC, id DESC")).rows;
    },
    async get(id) {
      return (await pool.query<Opportunity>("SELECT * FROM tracker.opportunities WHERE id = $1", [id])).rows.at(0);
    },
    create: data => addRow("opportunities", opportunityColumns, data),
    update: (id, data) => updateRow("opportunities", id, opportunityColumns, data),
    delete: id => removeRow("opportunities", id),
    async archive(id, archived) {
      const now = new Date().toISOString();
      const result = await pool.query(
        "UPDATE tracker.opportunities SET archived_at = CASE WHEN $1 THEN COALESCE(archived_at, $2) ELSE NULL END, updated_at = $2 WHERE id = $3",
        [archived, now, id],
      );
      return result.rowCount === 1;
    },
    async goals() {
      return (await pool.query<Goal>("SELECT * FROM tracker.goals ORDER BY end_date, created_at, id")).rows;
    },
    async getGoal(id) {
      return (await pool.query<Goal>("SELECT * FROM tracker.goals WHERE id = $1", [id])).rows.at(0);
    },
    createGoal: data => addRow("goals", goalColumns, data),
    updateGoal: (id, data) => updateRow("goals", id, goalColumns, data),
    deleteGoal: id => removeRow("goals", id),
    async tasks() {
      return (await pool.query<Task>("SELECT * FROM tracker.tasks ORDER BY due_date NULLS LAST, created_at DESC, id")).rows;
    },
    async getTask(id) {
      return (await pool.query<Task>("SELECT * FROM tracker.tasks WHERE id = $1", [id])).rows.at(0);
    },
    createTask: data => addRow("tasks", taskColumns, data),
    updateTask: (id, data) => updateRow("tasks", id, taskColumns, data),
    deleteTask: id => removeRow("tasks", id),
    completeTask(id, completed) {
      return inTrackerTransaction(pool, async client => {
        const task = (await client.query<Task>("SELECT * FROM tracker.tasks WHERE id = $1 FOR UPDATE", [id])).rows[0];
        if (!task) throw new Error("Task not found");
        const now = new Date().toISOString();
        await client.query("UPDATE tracker.tasks SET completed_at = $1, updated_at = $2 WHERE id = $3",
          [completed ? task.completed_at ?? now : null, now, id]);
        if (completed && !task.completed_at && task.opportunity_id && task.due_date) {
          await client.query(
            "UPDATE tracker.opportunities SET next_action = NULL, next_action_date = NULL, updated_at = $1 WHERE id = $2 AND lower(trim(next_action)) = lower(trim($3)) AND next_action_date = $4",
            [now, task.opportunity_id, task.title, task.due_date],
          );
        }
      });
    },
    async clearNextAction(id, title, date) {
      const result = await pool.query(
        "UPDATE tracker.opportunities SET next_action = NULL, next_action_date = NULL, updated_at = $1 WHERE id = $2 AND next_action = $3 AND next_action_date = $4",
        [new Date().toISOString(), id, title, date],
      );
      return result.rowCount === 1;
    },
    async allActivities() {
      return (await pool.query<Activity>("SELECT * FROM tracker.activities ORDER BY occurred_at DESC, created_at DESC, id DESC")).rows;
    },
    async activities(id) {
      return (await pool.query<Activity>(
        "SELECT * FROM tracker.activities WHERE opportunity_id = $1 ORDER BY occurred_at DESC, created_at DESC, id DESC", [id],
      )).rows;
    },
    logActivity(id, data, sourceId?: string) {
      return inTrackerTransaction(pool, async client => {
        const opportunity = (await client.query<Opportunity>("SELECT * FROM tracker.opportunities WHERE id = $1 FOR UPDATE", [id])).rows[0];
        if (!opportunity) throw new Error("Opportunity not found");
        if (sourceId) {
          const existing = (await client.query<{ opportunity_id: string }>("SELECT opportunity_id FROM tracker.activities WHERE id = $1", [sourceId])).rows[0];
          if (existing) {
            if (existing.opportunity_id !== id) throw new Error("The source is already assigned to a different opportunity.");
            return sourceId;
          }
          if (!isOpenResearchOpportunity(opportunity)) throw new Error("This research opportunity is closed or archived.");
        }
        const { latest, last_email } = (await client.query<{ latest: string | null; last_email: string | null }>(`
          SELECT MAX(occurred_at) FILTER (WHERE activity_type NOT IN ('General note', 'Follow-up email sent')) AS latest,
            MAX(occurred_at) FILTER (WHERE activity_type IN ('Initial email sent', 'Follow-up email sent')) AS last_email
          FROM tracker.activities WHERE opportunity_id = $1
        `, [id])).rows[0]!;
        const changes = opportunityAfterActivity(opportunity, data, latest, last_email);
        const now = new Date().toISOString();
        const activityId = sourceId ?? randomUUID();
        const inserted = await client.query(
          "INSERT INTO tracker.activities (id, opportunity_id, activity_type, occurred_at, notes, positive_response, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
          [activityId, id, data.activity_type, data.occurred_at, data.notes, data.activity_type === "Reply received" && data.positive_response ? 1 : 0, now],
        );
        if (inserted.rowCount !== 1) throw new Error("The activity source is already recorded.");
        await client.query(
          "UPDATE tracker.opportunities SET status = $1, closed_outcome = $2, next_action = $3, next_action_date = $4, updated_at = $5 WHERE id = $6",
          [changes.status, changes.closed_outcome, changes.next_action, changes.next_action_date, now, id],
        );
        return activityId;
      });
    },
    async outreachCounts() {
      return (await pool.query<Awaited<ReturnType<TrackerStore["outreachCounts"]>>>(`SELECT
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Initial email sent' AND o.type = 'Research' THEN o.id END) AS research_contacts,
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Initial email sent' AND o.type = 'Startup' THEN o.id END) AS startup_contacts,
        COUNT(DISTINCT CASE WHEN a.activity_type = 'Application submitted' AND o.type = 'Formal Internship' THEN o.id END) AS formal_applications
        FROM tracker.opportunities o JOIN tracker.activities a ON a.opportunity_id = o.id`)).rows[0]!;
    },
  } satisfies TrackerStore;
}
