import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { createTrackerPool } from "../../src/lib/tracker-postgres.ts";

export async function withTestPostgres(run: (pool: Pool, connection: string) => Promise<void>) {
  const connection = process.env.TRACKER_TEST_DATABASE_URL;
  if (!connection) throw new Error("Set TRACKER_TEST_DATABASE_URL to a local Postgres server with CREATE DATABASE access.");
  const url = new URL(connection);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Postgres tests require a loopback connection.");

  const name = `tracker_test_${randomUUID().replaceAll("-", "")}`;
  const admin = createTrackerPool(connection);
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    try {
      url.pathname = `/${name}`;
      const pool = createTrackerPool(url.toString());
      try {
        await pool.query(readFileSync(new URL("../../supabase/migrations/1_tracker.sql", import.meta.url), "utf8"));
        await run(pool, url.toString());
      } finally {
        await pool.end();
      }
    } finally {
      await admin.query(`DROP DATABASE ${name}`);
    }
  } finally {
    await admin.end();
  }
}
