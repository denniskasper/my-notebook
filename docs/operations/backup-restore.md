# Backup and restore

> **Not enabled in this demo.** The production database holds only throwaway data: demo Notebooks that visitors create and the seeded demo Notebook, which `pnpm demo:seed` recreates. Nothing in it is worth restoring, so backups would add a bucket, a credential and a cost without protecting anything. This runbook describes the setup a real deployment would switch on, so a reviewer can see how it would work.

## Intended setup

Dokploy manages the Postgres 18 database and can back it up on a schedule to any S3-compatible bucket.

| Setting     | Value                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Schedule    | Nightly, `0 3 * * *` (server time, outside demo hours)                                         |
| Destination | An S3-compatible bucket with a different provider than the server (`<BUCKET>`), so a lost server doesn't take its backups with it |
| Credentials | An access key that may only write and read that bucket, stored only in Dokploy                 |
| Retention   | Keep the last 14 nightly dumps (Dokploy's "keep latest" setting), plus a bucket lifecycle rule that deletes objects older than 30 days as a backstop |
| Encryption  | Server-side encryption on the bucket                                                           |

To switch it on:

1. In Dokploy, add the bucket as an **S3 destination** (endpoint, region, bucket `<BUCKET>`, access key) and click **Test**.
2. On the Postgres database, open **Backups**, add a backup with that destination, the schedule and retention above, and enable it.
3. Click **Run manually** once and check that a dump appears in the bucket.
4. Run the restore drill below once, then monthly.

A backup that has never been restored is not a backup, so the drill is part of the setup, not an extra.

## Restore drill

Restores into a scratch database, never over production. Run it on the server.

1. **Get the newest dump** from `<BUCKET>` (S3 console, `aws s3 cp` or `rclone`) into a temporary directory.
2. **Start a scratch Postgres 18** next to nothing else:

   ```sh
   docker run -d --name restore-drill -e POSTGRES_PASSWORD=drill postgres:18
   ```

3. **Restore the dump.** Check its format first with `file <DUMP>`:

   ```sh
   # custom-format dump (pg_dump -Fc)
   docker exec -i restore-drill pg_restore -U postgres -d postgres --no-owner < <DUMP>
   # plain SQL, gzipped
   gunzip -c <DUMP> | docker exec -i restore-drill psql -U postgres -d postgres
   ```

4. **Compare row counts** with production. Run the same query on both; the counts should match up to the rows written since the dump:

   ```sql
   select 'notebooks' as t, count(*) from notebooks
   union all select 'sources', count(*) from sources
   union all select 'passages', count(*) from passages
   union all select 'messages', count(*) from messages
   union all select 'notes', count(*) from notes
   union all select 'usage_events', count(*) from usage_events;
   ```

5. **Clean up:** `docker rm -f restore-drill` and delete the downloaded dump.

## Restoring production

Only when production data is actually lost:

1. Stop the Application in Dokploy, so nothing writes during the restore.
2. Restore the chosen dump into the production database (Dokploy's **Restore** on the backup, or step 3 above against the production database).
3. Start the Application. Migrations run at start and bring an older dump up to the current schema; they are expand/contract, so this is safe ([deployment.md](deployment.md#migrations-expandcontract)).
4. Check `<PRODUCTION_URL>/api/health` and the row counts.

Everything written between the dump and the loss is gone: with nightly dumps that is up to a day of data (RPO 24 h).
