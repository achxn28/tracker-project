import "server-only";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdmissionsData, College, Supplement } from "./admissions-model.ts";
import { admissionsGoalWithProgress, type AdmissionsGoal } from "./goal-model.ts";

const directory = () => process.env.TRACKER_ADMISSIONS_DIR || join(process.cwd(), "data", "admissions");

function withAdmissionsDatabase<T>(operation: (db: DatabaseSync) => T): T {
  mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory(), "admissions.sqlite"));
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS colleges (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, round TEXT NOT NULL,
        deadline TEXT, submitted INTEGER NOT NULL, docsUrl TEXT, supplementsUnknown INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS supplements (
        id TEXT PRIMARY KEY, collegeId TEXT NOT NULL REFERENCES colleges(id),
        title TEXT NOT NULL, prompt TEXT, wordLimit INTEGER, dueDate TEXT, status TEXT NOT NULL
          CHECK (status IN ('To write', 'Drafting', 'Ready for review', 'Done')), docsUrl TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS admissions_goal (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), title TEXT NOT NULL,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('active', 'paused')),
        CHECK (start_date <= end_date)
      ) STRICT;
    `);
    return operation(db);
  } finally {
    db.close();
  }
}

export function readAdmissions(): AdmissionsData {
  return withAdmissionsDatabase(db => ({
    colleges: (db.prepare("SELECT * FROM colleges ORDER BY deadline IS NULL, deadline, name").all() as unknown as College[])
      .map(college => ({ ...college, submitted: Boolean(college.submitted), supplementsUnknown: Boolean(college.supplementsUnknown) })),
    supplements: (db.prepare("SELECT * FROM supplements ORDER BY dueDate IS NULL, dueDate, rowid").all() as unknown as Supplement[])
      .map(supplement => ({ ...supplement })),
  }));
}

const collegeValues = (c: College) => [c.id, c.name, c.round, c.deadline, Number(c.submitted), c.docsUrl, Number(c.supplementsUnknown)] as const;
const supplementValues = (s: Supplement) => [s.id, s.collegeId, s.title, s.prompt, s.wordLimit, s.dueDate, s.status, s.docsUrl] as const;

export function saveCollege(college: College) {
  withAdmissionsDatabase(db => db.prepare(`
    INSERT INTO colleges VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, round=excluded.round, deadline=excluded.deadline,
      submitted=excluded.submitted, docsUrl=excluded.docsUrl, supplementsUnknown=excluded.supplementsUnknown
  `).run(...collegeValues(college)));
}

export function saveSupplement(supplement: Supplement) {
  withAdmissionsDatabase(db => db.prepare(`
    INSERT INTO supplements VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET collegeId=excluded.collegeId, title=excluded.title, prompt=excluded.prompt,
      wordLimit=excluded.wordLimit, dueDate=excluded.dueDate, status=excluded.status, docsUrl=excluded.docsUrl
  `).run(...supplementValues(supplement)));
}

export function completeSupplement(id: string) {
  return withAdmissionsDatabase(db => db.prepare("UPDATE supplements SET status = 'Done' WHERE id = ?").run(id).changes > 0);
}

export function readAdmissionsGoal(): AdmissionsGoal | null {
  return withAdmissionsDatabase(db => {
    const row = db.prepare("SELECT title, start_date, end_date, status FROM admissions_goal").get();
    return row ? { ...row } as AdmissionsGoal : null;
  });
}

export function readAdmissionsGoalProgress(supplements?: Supplement[]) {
  const goal = readAdmissionsGoal();
  return goal ? admissionsGoalWithProgress(goal, supplements ?? readAdmissions().supplements) : null;
}

export function saveAdmissionsGoal(goal: AdmissionsGoal) {
  withAdmissionsDatabase(db => db.prepare(`
    INSERT INTO admissions_goal VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET title=excluded.title, start_date=excluded.start_date,
      end_date=excluded.end_date, status=excluded.status
  `).run(goal.title, goal.start_date, goal.end_date, goal.status));
}

export function deleteAdmissionsGoal() {
  withAdmissionsDatabase(db => db.prepare("DELETE FROM admissions_goal WHERE singleton = 1").run());
}

export function readAdmissionsPreview(): AdmissionsData | null {
  try {
    return JSON.parse(readFileSync(join(directory(), "admissions-import.json"), "utf8")) as AdmissionsData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function importAdmissions(data: AdmissionsData) {
  withAdmissionsDatabase(db => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const college = db.prepare("INSERT INTO colleges VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING");
      const supplement = db.prepare("INSERT INTO supplements VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING");
      for (const row of data.colleges) college.run(...collegeValues(row));
      for (const row of data.supplements) supplement.run(...supplementValues(row));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
