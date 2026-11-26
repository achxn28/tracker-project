import { createTrackerPool } from "../src/lib/tracker-postgres.ts";
import { importTrackerSqlite, TrackerTransferError } from "../src/lib/tracker-transfer.ts";

const [source, extra] = process.argv.slice(2);
const connection = process.env.TRACKER_MIGRATION_DATABASE_URL;
if (!source || extra || !connection) {
  console.error("Set TRACKER_MIGRATION_DATABASE_URL and run npm run db:import -- <sqlite-backup-file>.");
  process.exitCode = 1;
} else {
  try {
    const pool = createTrackerPool(connection, process.env.TRACKER_DATABASE_CA_FILE);
    try {
      const counts = await importTrackerSqlite(source, pool);
      console.log("Imported and verified tracker rows:", counts);
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(error instanceof TrackerTransferError
      ? error.message
      : "Import failed. Check the SQLite backup, Postgres connection, schema, and role privileges.");
    process.exitCode = 1;
  }
}
