import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { arrangements, opportunityTypes, optionalFields, outcomes, priorities, statuses, type Opportunity, type OpportunityInput } from "./opportunity-model.ts";
import { activityTypes, opportunityAfterActivity, type Activity, type ActivityInput } from "./activity-model.ts";
import { taskCategories, type Task, type TaskInput } from "./task-model.ts";
import { goalMetrics, type Goal, type GoalInput } from "./goal-model.ts";

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
      archived_at TEXT,
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
      positive_response INTEGER NOT NULL DEFAULT 0 CHECK (positive_response IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS activities_opportunity_time ON activities(opportunity_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT,
      category TEXT NOT NULL CHECK (category IN (${sqlOptions(taskCategories)})),
      priority TEXT NOT NULL CHECK (priority IN (${sqlOptions(priorities)})),
      start_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS tasks_due_date ON tasks(due_date);
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      metric_type TEXT NOT NULL CHECK (metric_type IN (${sqlOptions(Object.keys(goalMetrics))})),
      target_count INTEGER NOT NULL CHECK (target_count > 0),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'paused')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (start_date <= end_date)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      follow_up_days INTEGER NOT NULL CHECK (follow_up_days BETWEEN 1 AND 365)
    ) STRICT;
  `);
  if (!db.prepare("PRAGMA table_info(opportunities)").all().some(column => column.name === "archived_at")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!db.prepare("PRAGMA table_info(opportunities)").all().some(column => column.name === "archived_at")) db.exec("ALTER TABLE opportunities ADD COLUMN archived_at TEXT");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const activitySchema = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'activities'").get()?.sql as string;
  if (!activitySchema.includes("'Offer accepted'")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const currentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'activities'").get()?.sql as string;
      if (!currentSchema.includes("'Offer accepted'")) db.exec(`
      CREATE TABLE activities_upgrade (
        id TEXT PRIMARY KEY NOT NULL,
        opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        activity_type TEXT NOT NULL CHECK (activity_type IN (${sqlOptions(activityTypes)})),
        occurred_at TEXT NOT NULL, notes TEXT,
        positive_response INTEGER NOT NULL DEFAULT 0 CHECK (positive_response IN (0, 1)),
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO activities_upgrade (id, opportunity_id, activity_type, occurred_at, notes, created_at)
        SELECT id, opportunity_id, activity_type, occurred_at, notes, created_at FROM activities;
      DROP TABLE activities;
      ALTER TABLE activities_upgrade RENAME TO activities;
      CREATE INDEX activities_opportunity_time ON activities(opportunity_id, occurred_at DESC);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  return {
    preferences: () => ({ ...(db.prepare("SELECT follow_up_days FROM preferences WHERE id = 1").get() ?? { follow_up_days: 7 }) }) as { follow_up_days: number },
    setFollowUpDays(days: number) {
      db.prepare("INSERT INTO preferences (id, follow_up_days) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET follow_up_days = excluded.follow_up_days").run(days);
    },
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
    archive(id: string, archived: boolean) {
      const now = new Date().toISOString();
      return db.prepare("UPDATE opportunities SET archived_at = CASE WHEN ? THEN COALESCE(archived_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?").run(archived ? 1 : 0, now, now, id).changes > 0;
    },
    goals: () => db.prepare("SELECT * FROM goals ORDER BY end_date, created_at").all().map(row => ({ ...row })) as Goal[],
    getGoal(id: string) {
      const row = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
      return row ? { ...row } as Goal : undefined;
    },
    createGoal(data: GoalInput) {
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare("INSERT INTO goals (id, title, metric_type, target_count, start_date, end_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, data.title, data.metric_type, data.target_count, data.start_date, data.end_date, data.status, now, now);
      return id;
    },
    updateGoal(id: string, data: GoalInput) {
      return db.prepare("UPDATE goals SET title = ?, metric_type = ?, target_count = ?, start_date = ?, end_date = ?, status = ?, updated_at = ? WHERE id = ?")
        .run(data.title, data.metric_type, data.target_count, data.start_date, data.end_date, data.status, new Date().toISOString(), id).changes > 0;
    },
    deleteGoal: (id: string) => db.prepare("DELETE FROM goals WHERE id = ?").run(id).changes > 0,
    tasks: () => db.prepare("SELECT * FROM tasks ORDER BY due_date IS NULL, due_date, created_at DESC").all().map(row => ({ ...row })) as Task[],
    getTask(id: string) {
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      return row ? { ...row } as Task : undefined;
    },
    createTask(data: TaskInput) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare("INSERT INTO tasks (id, title, description, category, priority, opportunity_id, start_date, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, data.title, data.description, data.category, data.priority, data.opportunity_id, data.start_date, data.due_date, now, now);
      return id;
    },
    updateTask(id: string, data: TaskInput) {
      return db.prepare("UPDATE tasks SET title = ?, description = ?, category = ?, priority = ?, opportunity_id = ?, start_date = ?, due_date = ?, updated_at = ? WHERE id = ?")
        .run(data.title, data.description, data.category, data.priority, data.opportunity_id, data.start_date, data.due_date, new Date().toISOString(), id).changes > 0;
    },
    completeTask(id: string, completed: boolean) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
        if (!task) throw new Error("Task not found");
        const now = new Date().toISOString();
        db.prepare("UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?").run(completed ? task.completed_at ?? now : null, now, id);
        if (completed && !task.completed_at && task.opportunity_id && task.due_date) {
          db.prepare("UPDATE opportunities SET next_action = NULL, next_action_date = NULL, updated_at = ? WHERE id = ? AND lower(trim(next_action)) = lower(trim(?)) AND next_action_date = ?")
            .run(now, task.opportunity_id, task.title, task.due_date);
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    deleteTask: (id: string) => db.prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0,
    clearNextAction(id: string, title: string, date: string) {
      return db.prepare("UPDATE opportunities SET next_action = NULL, next_action_date = NULL, updated_at = ? WHERE id = ? AND next_action = ? AND next_action_date = ?")
        .run(new Date().toISOString(), id, title, date).changes > 0;
    },
    allActivities: () => db.prepare("SELECT * FROM activities ORDER BY occurred_at DESC, created_at DESC, id DESC").all().map(row => ({ ...row })) as Activity[],
    activities: (id: string) => db.prepare("SELECT * FROM activities WHERE opportunity_id = ? ORDER BY occurred_at DESC, created_at DESC, id DESC").all(id).map(row => ({ ...row })) as Activity[],
    logActivity(id: string, data: ActivityInput) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const opportunity = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id) as Opportunity | undefined;
        if (!opportunity) throw new Error("Opportunity not found");
        const latest = db.prepare("SELECT MAX(occurred_at) AS time FROM activities WHERE opportunity_id = ? AND activity_type NOT IN ('General note', 'Follow-up email sent')").get(id)?.time as string | null;
        const lastEmail = db.prepare("SELECT MAX(occurred_at) AS time FROM activities WHERE opportunity_id = ? AND activity_type IN ('Initial email sent', 'Follow-up email sent')").get(id)?.time as string | null;
        const changes = opportunityAfterActivity(opportunity, data, latest, lastEmail);
        const timestamp = new Date().toISOString();
        const activityId = randomUUID();
        db.prepare("INSERT INTO activities (id, opportunity_id, activity_type, occurred_at, notes, positive_response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(activityId, id, data.activity_type, data.occurred_at, data.notes, data.activity_type === "Reply received" && data.positive_response ? 1 : 0, timestamp);
        db.prepare("UPDATE opportunities SET status = ?, closed_outcome = ?, next_action = ?, next_action_date = ?, updated_at = ? WHERE id = ?")
          .run(changes.status, changes.closed_outcome, changes.next_action, changes.next_action_date, timestamp, id);
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
