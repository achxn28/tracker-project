import { backupTrackerSqlite } from "../src/lib/tracker-sqlite-backup.ts";

const [source, destination, extra] = process.argv.slice(2);
if (!source || !destination || extra) {
  console.error("Usage: npm run db:backup -- <existing-sqlite-file> <new-backup-file>");
  process.exitCode = 1;
} else {
  try {
    await backupTrackerSqlite(source, destination);
    console.log("Created and verified a private tracker backup.");
  } catch {
    console.error("Backup failed. Check the source database, its integrity, and that the destination directory exists and the file does not.");
    process.exitCode = 1;
  }
}
