#!/usr/bin/env bash
# Makes the source (Oregon) database read-only and ends open sessions.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:readonly-on [-- --help]

Makes the source (Oregon) database read-only for every new session:
  1. ALTER DATABASE postgres SET default_transaction_read_only = on
  2. terminates client sessions opened before the switch, so they reconnect
     read-only (fails if an app role's session survives; platform
     supabase_admin sessions are expected to survive)
  3. opens a fresh connection and confirms a write fails

The switch time is kept in MIGRATION_DIR/readonly-since. A re-run (e.g. after
a dashboard restart) ends only sessions older than the FIRST switch, since
sessions opened after it are already read-only.

Undo with: npm run migration:readonly-off

Env: OLD_DB_URL, OLD_PROJECT_REF (must match the URL's project), MIGRATION_DIR
USAGE
}

handle_help "$@"
require_env OLD_DB_URL OLD_PROJECT_REF MIGRATION_DIR
load_db_env OLD_DB_URL
resolve_migration_dir --create
since_file="$MIGRATION_DIR_RESOLVED/readonly-since"
# A timestamptz as psql prints it; anything else must not reach the SQL.
TIMESTAMP_PATTERN='^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:.]+[+-][0-9:]+$'

host="$(db_host OLD_DB_URL)"
echo "== Read-only ON for source ($host)"

# A fresh session shows the database default, i.e. whether a switch is in place.
was_read_only="$(query_value OLD_DB_URL "SHOW default_transaction_read_only")"

# READ WRITE for this one transaction (a re-run starts read-only): no session
# state is left for the pooler to hand to the next client.
run_psql OLD_DB_URL -q -c "BEGIN READ WRITE;
  ALTER DATABASE postgres SET default_transaction_read_only = on; COMMIT"
echo "OK  default_transaction_read_only = on for new sessions"

cutoff="$(read_cutoff)"
if [[ "$was_read_only" == "off" ]]; then
  echo "$cutoff" >"$since_file"
  echo "OK  switch time $cutoff recorded"
elif [[ -f "$since_file" ]] && grep -qE "$TIMESTAMP_PATTERN" "$since_file"; then
  cutoff="$(cat "$since_file")"
  echo "OK  already read-only since $cutoff (recorded by the first run)"
else
  echo "WARN already read-only, but no record of when; ending every older session" >&2
fi

echo "== Ending sessions opened before the switch"
terminate_other_backends "$cutoff" || die "read-only is NOT safe yet: an app session can still write"

echo "== Probe: a fresh write must fail"
if probe_output="$(run_psql OLD_DB_URL -q -c "$PROBE_CREATE_SQL" 2>&1)"; then
  run_psql OLD_DB_URL -q -c "$PROBE_DROP_SQL"
  die "a fresh session could still write (probe table created, then dropped). Read-only is NOT in effect."
fi
if ! grep -q "read-only transaction" <<<"$probe_output"; then
  echo "$probe_output" >&2
  die "the probe failed for a reason other than read-only; check the error above"
fi
echo "OK  fresh write rejected: $probe_output"
echo "Source ($host) is read-only."
