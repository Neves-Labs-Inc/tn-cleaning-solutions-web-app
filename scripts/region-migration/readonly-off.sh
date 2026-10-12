#!/usr/bin/env bash
# Takes the source (Oregon) database back out of read-only.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:readonly-off [-- --help]

Reverses migration:readonly-on on the source (Oregon) database:
  1. ALTER DATABASE postgres SET default_transaction_read_only = off
  2. terminates other client sessions, which were opened read-only and would
     stay that way, so they reconnect read-write
  3. opens a fresh connection and confirms a write succeeds
     (creates and drops public.__ro_probe in one transaction)

Env: OLD_DB_URL, OLD_PROJECT_REF (must match the URL's project)
USAGE
}

handle_help "$@"
require_env OLD_DB_URL OLD_PROJECT_REF
load_db_env OLD_DB_URL

host="$(db_host OLD_DB_URL)"
echo "== Read-only OFF for source ($host)"

# This session starts read-only too: READ WRITE for this one transaction only,
# so no session state is left for the pooler to hand on.
run_psql OLD_DB_URL -q -c "BEGIN READ WRITE;
  ALTER DATABASE postgres SET default_transaction_read_only = off; COMMIT"
echo "OK  default_transaction_read_only = off for new sessions"

echo "== Ending sessions opened while read-only"
# Warn only: new sessions are writable either way, so carry on to the probe.
cutoff="$(read_cutoff)"
terminate_other_backends "$cutoff" ||
  echo "WARN app sessions above stay read-only until they reconnect or the project restarts." >&2

echo "== Probe: a fresh write must succeed"
# Drop first: a probe left by an interrupted readonly-on must not read as "not writable".
probe_output="$(run_psql OLD_DB_URL -q \
  -c "$PROBE_DROP_IF_EXISTS_SQL; $PROBE_CREATE_SQL; $PROBE_DROP_SQL" 2>&1)" || {
  echo "$probe_output" >&2
  die "a fresh write still fails; the source is NOT writable"
}
echo "OK  fresh write succeeded (probe created and dropped)"
echo "Source ($host) is writable."
