# shellcheck shell=bash
# Constants here are used by the scripts that source this file.
# shellcheck disable=SC2034
# Shared helpers for the region-migration scripts. Sourced, never run directly.
#
# Secrets rules: never `set -x`, never echo a *_URL or *_TOKEN value. Messages
# show hostnames only (via db_host). Child tools get the URL WITHOUT its
# password on argv (visible in `ps`); the password travels in PGPASSWORD only.

set -euo pipefail

# Dumps and snapshots hold password hashes and PII: owner-only by default.
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TSX="$REPO_ROOT/node_modules/.bin/tsx"
# tsx's loader trips a Node deprecation warning on every run; keep output readable.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-deprecation"

# Same version CI pins; keep in step with scripts/check-database-types.ts.
SUPABASE_CLI_VERSION="2.120.0"

# Fail fast on an unreachable host instead of hanging the window.
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# Usage: handle_help "$@" (after defining usage()).
handle_help() {
  local arg
  for arg in "$@"; do
    if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
      usage
      exit 0
    fi
  done
  if [[ $# -gt 0 ]]; then
    usage >&2
    die "unexpected argument(s); this script takes only --help"
  fi
}

# Usage: require_env VAR... Names every missing var, never prints values.
require_env() {
  local name
  local missing=()
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("$name")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    die "missing required env var(s): ${missing[*]}"
  fi
  if [[ ! -x "$TSX" ]]; then
    die "tsx not found at node_modules/.bin/tsx; run npm install in the repo"
  fi
}

# Usage: db_host OLD_DB_URL|NEW_DB_URL. Prints the hostname only.
db_host() {
  "$TSX" "$SCRIPT_DIR/db-target.ts" host "$1"
}

# Usage: assert_distinct_targets. Dies if both URLs share host and user.
assert_distinct_targets() {
  "$TSX" "$SCRIPT_DIR/db-target.ts" distinct ||
    die "refusing to continue: source and target must be different databases"
  echo "OK  source ($(db_host OLD_DB_URL)) and target ($(db_host NEW_DB_URL)) differ"
}

# Usage: resolve_migration_dir [--create]. Guards MIGRATION_DIR against the
# repo (and the main checkout, from a worktree) and sets MIGRATION_DIR_RESOLVED.
# Write only to MIGRATION_DIR_RESOLVED, never to the raw MIGRATION_DIR.
resolve_migration_dir() {
  MIGRATION_DIR_RESOLVED="$("$TSX" "$SCRIPT_DIR/migration-dir.ts" "$@")" ||
    die "MIGRATION_DIR failed the safety check (see above)"
  echo "OK  MIGRATION_DIR resolves to $MIGRATION_DIR_RESOLVED"
}

# Usage: read_cutoff. Prints the source's now() from a fresh session, so it is
# later than the ALTER that just committed.
read_cutoff() {
  local cutoff
  cutoff="$(query_value OLD_DB_URL "SELECT now()")" ||
    die "could not read the switch time from the source"
  [[ -n "$cutoff" ]] || die "the source returned an empty switch time"
  echo "$cutoff"
}

# Usage: load_db_env OLD_DB_URL|NEW_DB_URL. Validates the URL (and its project
# ref against OLD/NEW_PROJECT_REF when set), then sets <VAR>_NOPW (URL without
# password) and <VAR>_PW (password). Neither is ever printed.
load_db_env() {
  local url_var="$1"
  local nopw pw
  nopw="$("$TSX" "$SCRIPT_DIR/db-target.ts" no-password "$url_var")" ||
    die "$url_var failed validation (see above)"
  pw="$("$TSX" "$SCRIPT_DIR/db-target.ts" password "$url_var")" ||
    die "could not read the password from $url_var"
  printf -v "${url_var}_NOPW" '%s' "$nopw"
  printf -v "${url_var}_PW" '%s' "$pw"
}

# Usage: with_db_password OLD_DB_URL|NEW_DB_URL command [args...]
# Runs the command with PGPASSWORD set for this child only (left unset when the
# URL has no password, so ~/.pgpass still applies).
with_db_password() {
  local pw_var="${1}_PW"
  shift
  if [[ -n "${!pw_var}" ]]; then
    PGPASSWORD="${!pw_var}" "$@"
  else
    "$@"
  fi
}

# Usage: run_psql OLD_DB_URL|NEW_DB_URL [psql args...] (after load_db_env)
# -X skips ~/.psqlrc so nothing local changes autocommit or output.
run_psql() {
  local url_var="$1"
  local nopw_var="${1}_NOPW"
  shift
  with_db_password "$url_var" \
    psql -X -v ON_ERROR_STOP=1 "$@" --dbname "${!nopw_var}"
}

# Usage: query_value OLD_DB_URL|NEW_DB_URL SQL. Prints the bare result.
query_value() {
  run_psql "$1" -A -t -q -c "$2"
}

MONTREAL_TABLES_SQL="SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')"
MONTREAL_USERS_SQL="SELECT count(*) FROM auth.users"

# Usage: check_montreal_empty. Returns 0 when Montreal (NEW_DB_URL) has no
# public tables and no auth.users rows; prints what it found either way.
check_montreal_empty() {
  local host tables users
  host="$(db_host NEW_DB_URL)"
  tables="$(query_value NEW_DB_URL "$MONTREAL_TABLES_SQL")" ||
    die "could not query public tables on $host"
  users="$(query_value NEW_DB_URL "$MONTREAL_USERS_SQL")" ||
    die "could not count auth.users on $host"
  if [[ "$tables" == "0" && "$users" == "0" ]]; then
    echo "OK  target ($host) is empty: 0 public tables, 0 auth.users"
    return 0
  fi
  echo "target ($host) is NOT empty: $tables public table(s), $users auth.users row(s)" >&2
  return 1
}

# Ends every other client session on the source database (not this one, not
# background workers or replication). Insufficient privilege is reported per
# session instead of aborting the rest.
# read -d '' returns 1 at end of input; that is expected.
read -r -d '' TERMINATE_BACKENDS_SQL <<'SQL' || true
DO $$
DECLARE
  backend record;
BEGIN
  FOR backend IN
    SELECT pid,
      coalesce(usename, '(unknown)') AS role_name,
      coalesce(nullif(application_name, ''), '-') AS app_name
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND backend_type = 'client backend'
      AND datname = current_database()
      -- Sessions opened after the switch already have the new default.
      AND backend_start < '__CUTOFF__'::timestamptz
  LOOP
    BEGIN
      IF pg_terminate_backend(backend.pid) THEN
        RAISE NOTICE 'terminated pid % (role %, app %)',
          backend.pid, backend.role_name, backend.app_name;
      ELSE
        RAISE NOTICE 'pid % (role %) already gone', backend.pid, backend.role_name;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'COULD NOT TERMINATE pid % (role %, app %): %',
        backend.pid, backend.role_name, backend.app_name, SQLERRM;
    END;
  END LOOP;
END
$$;
SQL

# Usage: terminate_other_backends CUTOFF, a timestamptz read from the database
# right after the ALTER committed. Prints each session's outcome and points to
# the dashboard restart when privileges stop us.
terminate_other_backends() {
  local cutoff="$1"
  local output
  # The cutoff comes from the database's own now(), so substituting it is safe.
  output="$(run_psql OLD_DB_URL -q \
    -c "${TERMINATE_BACKENDS_SQL//__CUTOFF__/$cutoff}" 2>&1)" || {
    echo "$output" >&2
    die "terminating sessions failed"
  }
  if [[ -n "$output" ]]; then
    echo "$output"
  else
    echo "OK  no other client sessions were open"
  fi
  local survivors app_survivors
  survivors="$(grep "COULD NOT TERMINATE" <<<"$output" || true)"
  # supabase_admin sessions are the platform's own (e.g. Realtime) and expected.
  app_survivors="$(grep -v "(role supabase_admin," <<<"$survivors" || true)"
  if [[ -n "$app_survivors" ]]; then
    echo "FAIL an app role's session survived (above); its writes may still land." >&2
    echo "     Fallback: Supabase dashboard > Project Settings > General >" >&2
    echo "     Restart project, then re-run this script." >&2
    return 1
  fi
  if [[ -n "$survivors" ]]; then
    echo "OK  only platform supabase_admin sessions remain (expected; not app traffic)"
  fi
}

PROBE_CREATE_SQL="CREATE TABLE public.__ro_probe (id int)"
PROBE_DROP_SQL="DROP TABLE public.__ro_probe"
PROBE_DROP_IF_EXISTS_SQL="DROP TABLE IF EXISTS public.__ro_probe"

# Dump files in restore order, and the marker dump writes once all succeed.
DUMP_FILES=(roles.sql schema.sql history_schema.sql data.sql history_data.sql)
DUMP_COMPLETE_MARKER=".dump-complete"
