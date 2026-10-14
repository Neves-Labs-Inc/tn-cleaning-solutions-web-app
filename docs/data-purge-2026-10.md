# Production data purge runbook (October 2026)

Removes every appointment, recurring Series, invoice and time-sheet record, and
every archived Job, from production. Run once, by Franklin, from his own
machine, with `psql`. The script is `scripts/data-purge/purge.sql` (it includes
`purge-body.sql`). The business is in Toronto (Eastern time).

> **The deletes are permanent and no backup is taken.** Every `psql` command
> below starts with `purge_check &&` (defined in section 3), so it runs only
> when the URL is for the production project. Never remove that prefix.

## 1. What it removes and keeps

Source: client meeting 2026-10-13, requirements 6 and 7.

**Removes**

- every appointment, of any date, status or archive state;
- every recurring Series;
- every invoice of every status, and every invoice line;
- every time-sheet session, Clock correction and Odd duration acknowledgement;
- the invoice number counters, so numbering restarts at 001;
- once Payroll is deployed, every Pay run with its claimed shifts and Adjustments
  (they point at the sessions being removed); before that, these count 0;
- every Job with `is_archived = true`, and the client negotiated rates for those Jobs.

**Keeps**

- clients and client locations;
- employees;
- active Jobs and their negotiated rates;
- payment methods;
- Pay rates (once Payroll is deployed).

## 2. Preconditions

Tick every box before you start.

- [ ] The client's written confirmation is in hand.
- [ ] The script is merged on `main`, and your checkout is up to date with it.
- [ ] A quiet time is chosen. The transaction locks those tables for a few
      seconds, and app requests touching them wait until it ends.
- [ ] You accept that **no backup is taken.** Franklin decided on 2026-10-13
      that the records exist elsewhere, and accepted running without a backup
      or export.
- [ ] You have read the ESA/CRA note below.
- [ ] You accept the duplicate-number risk below.

**ESA/CRA note.** The `clock_corrections` migration records that Ontario ESA
and CRA call for keeping clock corrections for 6 years. This purge removes them
for good, with no copy kept by this process.

**Invoice numbers restart.** The counters are removed, so the next issued
invoice is `INV-001-...`. That can match a number the client received before.
This risk is accepted.

## 3. Get the production connection URL

1. In the Supabase dashboard, open the production project and click
   **Connect**. Copy the session pooler or direct connection string, with the
   real password filled in.
2. In the terminal you will use for every step below, type:

   ```bash
   read -rs PURGE_DB_URL
   ```

   Paste the URL and press Enter. Nothing is echoed. Then:

   ```bash
   export PURGE_DB_URL
   ```

   The URL never appears on a command line, so it is not in shell history. Do
   not paste it into a command, a file or a chat.
3. Optional, recommended: make the transaction give up instead of queueing
   behind a long-running query.

   ```bash
   export PGOPTIONS='-c lock_timeout=10s'
   ```

   A direct connection honors this. If the session pooler rejects the startup
   option, run `unset PGOPTIONS` and use the direct connection instead.

4. Set the **production** project ref. It is in the dashboard URL
   (`supabase.com/dashboard/project/<ref>`): 20 characters, lowercase letters
   and digits. Copy it from the prod project's page, then type:

   ```bash
   printf 'prod ref: '; read -r PROD_REF
   ```

   Paste the ref and press Enter.
5. Paste this block into the same terminal. It defines `purge_check`, which
   every later `psql` command runs first:

   ```bash
   purge_check() {
     case "$PROD_REF" in
       *[![:lower:][:digit:]]*) echo 'STOP: prod ref must be only a-z and 0-9'; return 1 ;;
     esac
     if [ "${#PROD_REF}" -ne 20 ]; then
       echo 'STOP: prod ref must be exactly 20 characters'; return 1
     fi
     case "$PURGE_DB_URL" in
       *"://postgres.$PROD_REF:"*|*"@db.$PROD_REF.supabase.co:"*) echo "OK: target is prod ref $PROD_REF" ;;
       *) echo 'STOP: URL is not for the prod project'; return 1 ;;
     esac
   }
   purge_check
   ```

   It refuses an empty, short or malformed ref. It then matches the ref only
   where Supabase puts it: the username of a session pooler string
   (`://postgres.<ref>:`) or the host of a direct one (`@db.<ref>.supabase.co:`),
   so a fragment inside the password or the pooler host cannot pass. If it
   prints `STOP`, fix the ref or re-enter the URL (step 2), and run
   `purge_check` again. Do not go on until it prints `OK`.

Always run with `psql -X`. It skips `~/.psqlrc`, so a personal config cannot set
`confirm` or `AUTOCOMMIT`.

## 4. Dry run

```bash
purge_check && psql -X "$PURGE_DB_URL" -f scripts/data-purge/purge.sql
```

Run it from the repo root. If `purge_check` prints `STOP`, `psql` does not run;
go back to section 3. A dry run does the whole purge inside one
transaction, prints counts, then rolls back.

Check:

- The first line is `OK: target is prod ref <ref>`, and that ref is the one
  on the prod project's dashboard page. On the session pooler, `host:` and
  `database:` are the same for every Supabase project, so they cannot confirm
  production by themselves; `purge_check` is the check. If anything is off,
  stop here and do not continue.
- `mode:` says `DRY RUN`.
- The BEFORE counts: every row marked `remove` is what you expect to lose, and
  every row marked `keep` is what you expect to stay.
- The AFTER counts: zero for everything removed, and unchanged from BEFORE for
  everything kept.
- It ends with `DRY RUN: rolled back, nothing changed`.

## 5. Commit

```bash
purge_check && psql -X "$PURGE_DB_URL" -v confirm=PURGE -f scripts/data-purge/purge.sql
```

It runs only after `OK: target is prod ref <ref>`. Check that `mode:` says `COMMIT` and that the output ends with `COMMIT` and
`COMMITTED: purge is permanent`.

## 6. Verify

1. Re-run the dry run, gated the same way:

   ```bash
   purge_check && psql -X "$PURGE_DB_URL" -f scripts/data-purge/purge.sql
   ```

   It must print `OK: target is prod ref <ref>` first. Every BEFORE count
   marked `remove` is 0, and the `keep` counts match what they were before the
   commit.
2. Spot-check the app: the schedule, invoices and time sheets are empty, while
   clients and active Jobs are present.

## 7. If it fails

The whole purge is one transaction. Any error aborts it and **nothing
changes**.

- If the error names a table the script does not know references a purged table
  (the schema drift guard), stop. Confirm that table's rows should go, then add
  it to the `TRUNCATE` list in `scripts/data-purge/purge-body.sql` in a
  reviewed change, merge it, and start again from section 4.
- If it fails on a lock timeout, pick a quieter time and start again from
  section 4.
- If the connection drops before the COMMIT line, assume nothing changed, then
  run the dry run again to see the real state.

## 8. Safety notes

- This is not a migration. Deploys never run it, and `supabase db push` never
  sees `scripts/`.
- The pipeline and CI only ever run it against local Supabase, inside
  rolled-back transactions. The test command is
  `node --test "tests/data-purge/*.test.ts"` with `PURGE_TEST_DB_URL` pointing
  at local Supabase (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
  The test refuses any non-local host.
- When you are done, clear the secrets from the shell:

  ```bash
  unset PURGE_DB_URL PGOPTIONS PROD_REF
  unset -f purge_check
  ```
