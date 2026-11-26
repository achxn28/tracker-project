import "server-only";
import { join } from "node:path";
import { openOpportunityStore } from "./opportunities.ts";

type SQLiteStore = Omit<ReturnType<typeof openOpportunityStore>, "close">;
type Awaitable<T> = T | Promise<T>;

export type TrackerStore = {
  [Key in keyof SQLiteStore]: (...args: Parameters<SQLiteStore[Key]>) => Awaitable<ReturnType<SQLiteStore[Key]>>;
};

export async function withTrackerStore<T>(operation: (store: TrackerStore) => Awaitable<T>): Promise<T> {
  const store = openOpportunityStore(process.env.OPPORTUNITY_DB_PATH || join(process.cwd(), "data", "opportunities.sqlite"));
  try {
    return await operation(store);
  } finally {
    store.close();
  }
}
