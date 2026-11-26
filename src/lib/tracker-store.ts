import "server-only";
import { join } from "node:path";
import { openOpportunityStore } from "./opportunities.ts";
import { createTrackerPool, postgresTrackerStore } from "./tracker-postgres.ts";

type SQLiteStore = Omit<ReturnType<typeof openOpportunityStore>, "close">;
type Awaitable<T> = T | Promise<T>;

export type TrackerStore = {
  [Key in keyof SQLiteStore]: (...args: Parameters<SQLiteStore[Key]>) => Awaitable<ReturnType<SQLiteStore[Key]>>;
};

let postgres: TrackerStore | undefined;

export async function withTrackerStore<T>(operation: (store: TrackerStore) => Awaitable<T>): Promise<T> {
  const backend = process.env.TRACKER_DB_BACKEND || "sqlite";
  if (backend === "postgres") {
    postgres ??= postgresTrackerStore(createTrackerPool(process.env.TRACKER_DATABASE_URL ?? "", process.env.TRACKER_DATABASE_CA_FILE));
    return await operation(postgres);
  }
  if (backend !== "sqlite") throw new Error("Choose sqlite or postgres for TRACKER_DB_BACKEND.");

  const store = openOpportunityStore(process.env.OPPORTUNITY_DB_PATH || join(process.cwd(), "data", "opportunities.sqlite"));
  try {
    return await operation(store);
  } finally {
    store.close();
  }
}
