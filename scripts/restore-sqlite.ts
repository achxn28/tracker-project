import { createTrackerPool } from "../src/lib/tracker-postgres.ts";
import { restoreTrackerSqlite, TrackerTransferError } from "../src/lib/tracker-transfer.ts";

const [destination, extra] = process.argv.slice(2);
const connection = process.env.TRACKER_MIGRATION_DATABASE_URL;
if (!destination || extra || !connection) {
  console.error("Set TRACKER_MIGRATION_DATABASE_URL and run npm run db:restore -- <new-sqlite-file>.");
  process.exitCode = 1;
} else {
  try {
    const pool = createTrackerPool(connection, process.env.TRACKER_DATABASE_CA_FILE);
    try {
      const counts = await restoreTrackerSqlite(pool, destination);
      console.log("Restored and verified tracker rows:", counts);
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(error instanceof TrackerTransferError
      ? error.message
      : "Restore failed. Check the Postgres connection, schema, and that the destination directory exists and the file does not.");
    process.exitCode = 1;
  }
}
