# Rehearse and cut over the tracker database

The Next.js app still runs on localhost. SQLite remains the default. PostgreSQL
is optional and the switch requires an explicit setting. The four Novus CRM
workbooks still use the local Sheets OAuth connection and the original Sheets
save flow. The migration commands only handle the five tracker tables.

## Rehearse locally

Use Node.js 24 or later and a disposable Postgres instance. Set
`TRACKER_TEST_DATABASE_URL` to a loopback Postgres connection with permission to
create a database. The integration tests create and remove their own temporary
databases.

```sh
npm test
npm run test:postgres
npm run lint
npm run typecheck
npm run build
```

The app and transfer commands use different connection settings:

| Variable | Used for |
| --- | --- |
| `TRACKER_DB_BACKEND` | Optional app setting. Set to `postgres` to opt in. Defaults to `sqlite`. |
| `TRACKER_DATABASE_URL` | App connection with its own database role. |
| `TRACKER_MIGRATION_DATABASE_URL` | CLI connection with access to read or import all five tables. |
| `TRACKER_DATABASE_CA_FILE` | Optional path to a trusted CA certificate for the app and transfer commands. |
| `OPPORTUNITY_DB_PATH` | Optional SQLite path used by the app. |

Keep app credentials in ignored `.env.local` or a private environment manager.
Supply the transfer URL through the shell environment or an environment manager.
The Node CLI commands use their process environment. Postgres connections
outside loopback use TLS with certificate verification. Connection URLs accept
`sslmode=verify-full` if needed. Plaintext is available for loopback Postgres
rehearsals. For supported Supabase connection modes and certificates, see
[Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Prepare Postgres

1. Apply [the tracker schema](../supabase/migrations/1_tracker.sql) once to the
   intended empty database using an administrative connection. Use a single
   transaction. Keep the `tracker` schema private.
2. Create dedicated login roles for the local app. Use a read-only role for
   the first smoke check and a runtime role for normal writes. For example,
   run this SQL as the schema owner on an empty rehearsal database, then set
   the passwords using a secure prompt such as psql's `\password`.

   ```sql
   CREATE ROLE tracker_reader LOGIN;
   CREATE ROLE tracker_app LOGIN;
   GRANT USAGE ON SCHEMA tracker TO tracker_reader, tracker_app;
   GRANT SELECT ON ALL TABLES IN SCHEMA tracker TO tracker_reader;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tracker TO tracker_app;
   ```

   A migration or admin credential stays outside the app. Keep the tracker
   schema out of Supabase's exposed Data API schemas.
3. Rehearse the steps below with synthetic data before uploading real tracker
   records. Verify that the reader can select records and receives a permission
   error on writes. Keep the original SQLite file and an independent backup.

## Back up and import

Stop the local tracker before the final snapshot so a newer SQLite write cannot
miss the cutover. If the app uses `OPPORTUNITY_DB_PATH`, pass that actual path
instead of the default in this example.

```sh
mkdir -p -m 700 data/backups
npm run db:backup -- data/opportunities.sqlite data/backups/before-postgres.sqlite
npm run db:import -- data/backups/before-postgres.sqlite
```

Both outputs and backups must stay outside Git. The backup command checks
integrity and foreign keys. Import verifies the five tables row by row inside
a transaction and refuses a target with existing tracker records. It upgrades
older SQLite schemas on a private copy. The commands report counts for
successful transfers.

## Switch the local app

1. Set `TRACKER_DB_BACKEND=postgres` and use the read-only connection for
   `TRACKER_DATABASE_URL`. Restart the server.
2. Check Dashboard, Research, Opportunities, Tasks, Goals, Timeline, Settings,
   and CSV exports against the original database. Compare notes, date ranges,
   archived opportunities, linked records, and recruiting totals. Read the
   four CRMs with the existing grant. Use a mock or a disposable spreadsheet
   for a save check.
3. Once those checks pass, change to the app runtime role and restart. SQLite
   remains a backup from this point forward. Test a small deliberate edit and
   confirm it persists across another restart.
4. Retain private Postgres dumps off site and test restoring them. Supabase Free
   does not include automatic database backups. The SQLite restore command is
   also suitable for a portable snapshot of these five tables.
   [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

## Roll back

Before enabling Postgres writes, stop the app, select SQLite, and restart
against the original database. After enabling Postgres writes, first stop the
app and any other writes to Postgres. Restore a fresh snapshot to a new path:

```sh
npm run db:restore -- data/backups/after-postgres.sqlite
```

The restore command takes a consistent Postgres snapshot, verifies every row,
and publishes a new private SQLite file. It refuses to overwrite an existing
file. Point `OPPORTUNITY_DB_PATH` to the restored file and select
`TRACKER_DB_BACKEND=sqlite`. Verify the newest edits before resuming local
writes. Keep both database versions until the rollback checks pass.
