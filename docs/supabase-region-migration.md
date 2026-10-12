# Supabase region migration runbook (Oregon to Montreal)

Moves production from the Oregon Supabase project (old) to the empty Montreal
(ca-central-1) project (new). Both are on the Free plan, hosting is Vercel, and
the business is in Toronto (Eastern time). Written to be followed alone.

Terms: **old** = Oregon, **new** = Montreal. The cutover is a hard switch with
read-only downtime; nothing is written to Oregon after step 1.

> **No dry run was done.** These scripts were never run against hosted
> Supabase. Three things run for the first time on the night: the restore with
> real roles, the dump's owner-line fixups, and auth-diff with a real token.
> Each is flagged where it first runs, with what to do if it fails.

## 1. Overview and timeline

| Step | Estimate |
|---|---|
| Read-only | ~2 min |
| Dump | ~5 min |
| Restore | ~5 min |
| Verify + auth-diff | ~3 min |
| Vercel env + merge + build | ~5-8 min |
| Smoke test | ~5 min |

Total about 25-30 minutes. Abort if the clock passes 45 minutes (section 5).

- The day before, re-time the dump by running `npm run migration:dump` **without**
  read-only (it only reads). Adjust the estimates and the window. Delete that
  dump afterwards; the real one is taken on the night.
- Pick quiet Toronto hours.
- Tell staff beforehand: the app is unavailable for the window, and **everyone
  must sign in again once afterwards** (passwords are unchanged).

## 2. Prerequisites

Install before the night:

- **Docker** (running) and **Node.js**. The scripts call
  `npx supabase@2.120.0`, so no global Supabase CLI install is needed.
- **psql 15 or newer**. preflight refuses older versions. Check with
  `psql --version`. On macOS: `brew install postgresql@17`, then put it on
  your PATH (the formula is keg-only):
  `export PATH="$(brew --prefix postgresql@17)/bin:$PATH"` (or
  `brew link --force postgresql@17`). `brew install libpq` needs the same step.
- The **Vercel CLI** (`npm i -g vercel`), `vercel login`, and the checkout
  linked to the project (`vercel link`) so `vercel env` knows which project to
  change.
- A Supabase **personal access token** (dashboard > Account > Access Tokens).
- The **Session pooler** connection string for both projects (dashboard >
  Connect). Reset the database password in Project Settings > Database if you
  don't have it. **Percent-encode special characters in the password** (`@ # / ?`
  and so on) inside the URL, or reset it to an alphanumeric one; a raw
  `@` or `/` misparses the host or user and the ref check then fails confusingly.
- A checkout of the feature branch with `npm install` done; run every script
  from its root.

Export the variables **in the shell only**, never into a file in the repo.
A leading space keeps a command out of history when `HISTCONTROL=ignorespace`
(or `ignoreboth`) is set; otherwise run `unset HISTFILE` first.

```bash
# Set the project refs first: the scripts check each URL against its ref.
 export OLD_PROJECT_REF='<oregon-project-ref>'
 export NEW_PROJECT_REF='<montreal-project-ref>'
 export OLD_DB_URL='postgresql://<user>:<password>@<oregon-pooler-host>:5432/postgres'
 export NEW_DB_URL='postgresql://<user>:<password>@<montreal-pooler-host>:5432/postgres'
 export SUPABASE_ACCESS_TOKEN='<personal-access-token>'
 # Outside the repo. Use the SAME value for every step: readonly-on records
 # readonly-since here and readonly-off/dump/verify use it.
 export MIGRATION_DIR="$HOME/tn-migration-YYYYMMDD"
```

If you open a new terminal mid-run, re-export all of them, with the same
`MIGRATION_DIR`.

Run `npm run migration:<step> -- --help` for any step's usage.

## 3. Before the window

### Montreal configuration checklist

In the Montreal dashboard, match Oregon:

- [ ] Authentication > URL Configuration: **Site URL** = the prod app URL
- [ ] **Redirect URLs**: `<prod-url>/accept-invite` and `<prod-url>/update-password`
- [ ] **Custom SMTP** (re-enter the SMTP password; it is never copied)
- [ ] **Invite email template** from `supabase/templates/invite-email.html`,
      subject `Welcome to TN Cleaning Solutions` (see `docs/email-templates.md`)
- [ ] **Auth rate limits** matching Oregon
- [ ] The new **publishable** and **secret** API keys exist (Project Settings >
      API Keys); copy them for the Vercel step below

### Run the checks

```bash
npm run migration:auth-diff
npm run migration:preflight
```

**auth-diff** GETs both projects' auth config with the token. Clean means exit 0:
no field "differs". Items listed as "verify manually" are values the API
redacts (SMTP password, secrets); check those by eye in both dashboards. Secrets
are masked in output. *First run with a real token:* if it prints
`HTTP 401/403`, the token is wrong or expired; create a new one. If it exits 1
with differing fields, fix them in Montreal and re-run until clean.

**preflight** is read-only. It checks psql 15+, Docker, the CLI via npx,
`MIGRATION_DIR` (created mode 700, must be outside the repo), both databases
reachable, old and new are different databases, Montreal is empty, Oregon has
0 `vault.secrets` (the dump skips vault), and extensions.
Any `FAIL` exits 1 and must be resolved before the night:

- `source has <n> vault.secrets`: the check counts Oregon's secrets, so
  recreating them in Montreal does not clear it; a non-zero count blocks the
  run (script limitation). Remove the unneeded secrets from Oregon, or stop
  and rethink the plan (the dump does not carry vault).
- `not available on target at all: <ext>`: it can't be enabled in the
  dashboard on Montreal. Drop the extension on Oregon if it is unused, or
  contact Supabase support.

### Vercel

ADD the new keys now with Montreal values, for Production, Preview and
Development. Leave the old variables and `NEXT_PUBLIC_SUPABASE_URL` alone;
existing deployments keep their snapshot of the environment.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY development
vercel env add SUPABASE_SECRET_KEY production
vercel env add SUPABASE_SECRET_KEY preview
vercel env add SUPABASE_SECRET_KEY development
```

(Paste the Montreal publishable / secret key when prompted.)

Finally:

- Make the feature PR green (lint, test, build) but **do not merge it**.
- Note the **current production deployment ID** in Vercel (Deployments). It is
  the rollback target.

## 4. Cutover

Run these in order, in one terminal with the section 2 variables exported.
Stop at the first failure and read section 5.

### 4.1 Read-only on Oregon

```bash
npm run migration:readonly-on
```

Sets `default_transaction_read_only = on` for the database, ends client
sessions opened before the switch, then opens a fresh connection and confirms a
write fails. Success ends with `Source (<host>) is read-only.` and the switch
time is saved in `$MIGRATION_DIR/readonly-since`. The app is now down for
writes.

- **`WARN already read-only, but no record of when; ending every older
  session`**: `readonly-since` is missing in this `MIGRATION_DIR` (a different
  directory, or a switch done by hand), so the cutoff is `now()` and every
  older session is ended. This is safe; let it finish. If you changed
  `MIGRATION_DIR`, set it back to the original.
- **`FAIL an app role's session survived`**: dashboard > Project Settings >
  General > Restart project, then re-run. Surviving `supabase_admin` sessions
  are the platform's own and expected.
- **Probe says the database is not read-only** (`a fresh session could still
  write`) can be a false report: a reused pooler connection may carry stale
  session state. It fails safe (the script stops). Re-run
  `npm run migration:readonly-on`; if it persists, restart the project from
  the dashboard and re-run. Do not continue until the probe prints
  `fresh write rejected`.

### 4.2 Dump

```bash
npm run migration:dump
```

Runs `supabase db dump` five times into `$MIGRATION_DIR` (`roles.sql`,
`schema.sql`, `data.sql`, `history_schema.sql`, `history_data.sql`), then
comments out `ALTER ... OWNER TO "supabase_admin"` lines in `schema.sql` and
`GRANT "postgres" TO "cli_login_postgres"` in `roles.sql`. It prints the line
counts, file sizes, and writes `.dump-complete` only when everything succeeded.

*First run on hosted Supabase:* if it warns `no supabase_admin owner lines
matched` (0 lines changed), the restore may fail on ownership. Open
`schema.sql`, search for `OWNER TO`, and comment out any `supabase_admin` owner
lines by hand (prefix with `-- `), then continue. If a `db dump` call fails,
check Docker is running and the URL/password, and re-run (it clears its old
output first).

### 4.3 Restore

```bash
npm run migration:restore
```

Refuses unless old and new differ and Montreal is empty, then loads roles,
schema, history schema, and (with `session_replication_role = replica`) data in
ONE transaction. Success prints `Restore committed in <n>s`.

*First run with real roles:* if it fails, the transaction rolls back and
Montreal stays empty (the script re-checks and says so). See section 5 for the
known fixes; you may retry once more.

### 4.4 Verify

```bash
npm run migration:verify
```

Snapshots both databases (exact row counts for public, auth and storage tables,
public schema objects, migration history), writes
`snapshot-old.json` / `snapshot-new.json` to `MIGRATION_DIR`, and compares.
`MATCH` (exit 0) means continue. Exit 1 has two kinds of output; read the
last line:

- `NOT a match: the copy is incomplete. This is an abort criterion.` Lines
  are listed under `MISMATCHES: rows, public schema or migration history
  differ`. Abort (section 5).
- `NOT a match: service-version drift only. Review above.` Every line is under
  `Drift: a 0-row auth/storage table or an extension on one side only`. The
  new project may simply run newer Auth/Storage versions. Continue if each
  line is a 0-row table or an extension you expect (e.g. a default extension
  of new projects). Abort if any line is unclear or a table you know has
  data.

### 4.5 Auth diff

```bash
npm run migration:auth-diff
```

Re-run now that nothing should have changed: exit 0 plus the manual-check list
you already verified.

### 4.6 Point the app at Montreal (Vercel)

Replace `NEXT_PUBLIC_SUPABASE_URL` with the Montreal URL in all three
environments:

```bash
for env in production preview development; do
  vercel env update NEXT_PUBLIC_SUPABASE_URL "$env" --yes   # paste the Montreal URL
done
```

`vercel env update <name> <environment>` replaces the value in place. If it
errors because the variable doesn't exist for an environment, use
`vercel env add NEXT_PUBLIC_SUPABASE_URL <environment>` instead. (If you
prefer `vercel env rm <name> <environment> --yes` then `add`: a variable
created in the dashboard with all three targets is one record, so a "not
found" from `rm` on preview/development after production's `rm` is fine.)
Check with `vercel env ls`.

The publishable and secret keys were added in section 3. This branch's code
reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY`; the old anon/service-role names are no longer used.

### 4.7 Merge and deploy

Merge the PR. That triggers the Vercel production build. Wait for **Ready**.
(Merging and deploying happen inside the window: it is part of the hard switch.)

### 4.8 Smoke test

- [ ] Log in as admin; everyone signs in again once after the move
- [ ] View the schedule
- [ ] Open an invoice
- [ ] Make a harmless write (edit a note, then revert it)
- [ ] Log in as a cleaner on a phone
- [ ] Send an invite or a password reset to yourself; check it arrives (SMTP)
      and uses the right template and links

If all pass, the move is done. Leave Oregon read-only (it is the rollback
copy; see section 6).

## 5. Abort and restore-failure path

There is no rehearsal, so decide in advance. **Abort** if:

- restore fails twice, or
- verify shows any `MISMATCHES:` line (or a drift line you can't explain), or
- the clock passes 45 minutes.

**If the PR is not merged yet:** run `npm run migration:readonly-off` (Oregon
is writable again; it ends read-only sessions and probes a write). If you
already changed `NEXT_PUBLIC_SUPABASE_URL`, set it back to the Oregon URL in
all three environments. The app is back on Oregon and you are done.

**If the PR is merged:** follow section 6, Rollback.

**Retrying a restore:** the single transaction rolls back, so Montreal is
empty. Re-run `npm run migration:preflight` (its empty check) before retrying.

**If Montreal is not empty after any abort past 4.3** (fully restored, or somehow partly populated; preflight and restore refuse a non-empty target): delete the project in the
dashboard, create a new empty one in Canada Central, update `NEW_DB_URL` and
`NEW_PROJECT_REF`, the Vercel publishable/secret (and URL) values, and redo the
Montreal checklist in section 3.

Known restore errors and fixes are in the Supabase guide:
<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
(`supabase_admin` object ownership, `cli_login_postgres` role grant, extensions
that must be enabled on the new project first). The dump already applies the
first two; if one still appears, apply the fix to the file in `MIGRATION_DIR`
and retry (empty check first).

## 6. Rollback (any time within 7 days)

Vercel facts (from the Vercel docs, Instant Rollback page): Hobby can roll back
only to the *immediately previous* production deployment; Pro/Enterprise can
pick any previously production-aliased one. Instant Rollback restores the old
deployment as built and does not change environment variables. After a
rollback, Vercel turns off auto-assignment of production domains, so new
pushes do not go live until you undo the rollback by promoting a deployment
(dashboard **Undo Rollback**, or `vercel promote <deployment-id-or-url>`).

1. Vercel **Instant Rollback** to the pre-cutover production deployment noted
   in section 3. If Vercel doesn't offer it (Hobby, or anything else reached
   production since), skip it: steps 2 and 4 do the same job with one build.
2. Set `NEXT_PUBLIC_SUPABASE_URL` back to the Oregon URL in all environments
   (`vercel env update NEXT_PUBLIC_SUPABASE_URL <environment> --yes`). The old
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` still hold
   Oregon values until day 7; nothing to do for them.
3. `npm run migration:readonly-off` against Oregon (same exports as section 2).
   If Free auto-pause paused the project, restore it from the dashboard first.
4. `git revert` the merge on main. When that build is Ready, **promote** it to
   production (`vercel promote <deployment-id-or-url>` or **Undo Rollback**),
   because after an Instant Rollback new production builds are not
   auto-assigned. This also re-enables normal deploys for any later attempt.
5. Rows written in Montreal since cutover must be re-entered by hand.

## 7. Day 7 decommission

Only after a week with no rollback:

- Delete the Oregon project in the dashboard.
- `vercel env rm` the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` (all environments).
- Securely delete `MIGRATION_DIR` (it holds password hashes and PII), e.g.
  `rm -rf "$MIGRATION_DIR"`.
- Revoke the personal access token.
- Update `.env.local` on dev machines (`docs/local-setup.md`).
