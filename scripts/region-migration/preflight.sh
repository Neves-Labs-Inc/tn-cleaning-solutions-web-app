#!/usr/bin/env bash
# Read-only checks to run before the maintenance window.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'EOF'
Usage: npm run migration:preflight [-- --help]

Read-only checks before the region move. Changes nothing in either database.
  - psql installed, Docker running, supabase CLI runs via npx
  - MIGRATION_DIR is outside the repo (created with mode 700 if absent)
  - both databases reachable; source and target are different databases
  - target (Montreal) is empty: no public tables, no auth.users
  - source (Oregon) has 0 vault.secrets (the dump skips vault)
  - lists source extensions and any the target lacks

Env: OLD_DB_URL, NEW_DB_URL (Session pooler strings), MIGRATION_DIR
EOF
}

handle_help "$@"
require_env OLD_DB_URL NEW_DB_URL MIGRATION_DIR
load_db_env OLD_DB_URL
load_db_env NEW_DB_URL

MIN_PSQL_MAJOR=15
failures=0
fail() {
  echo "FAIL $*" >&2
  failures=$((failures + 1))
}

echo "== Tools"
command -v psql >/dev/null || die "psql not found; install the PostgreSQL client"
# restore runs several -c/-f under --single-transaction; older clients differ
# there, and the servers are Postgres 17, so require a modern psql.
psql_major="$(psql --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
[[ "$psql_major" -ge "$MIN_PSQL_MAJOR" ]] ||
  die "psql $psql_major is too old; restore needs psql $MIN_PSQL_MAJOR or newer"
echo "OK  $(psql --version)"
docker info >/dev/null 2>&1 || die "Docker is not running; supabase db dump needs it"
echo "OK  Docker is running"
cli_version="$(npx --yes "supabase@$SUPABASE_CLI_VERSION" --version)" ||
  die "npx supabase@$SUPABASE_CLI_VERSION failed"
echo "OK  supabase CLI $cli_version"

echo "== MIGRATION_DIR"
resolve_migration_dir --create

echo "== Connectivity"
old_host="$(db_host OLD_DB_URL)"
new_host="$(db_host NEW_DB_URL)"
query_value OLD_DB_URL "SELECT 1" >/dev/null || die "cannot connect to source ($old_host)"
echo "OK  source ($old_host) reachable"
query_value NEW_DB_URL "SELECT 1" >/dev/null || die "cannot connect to target ($new_host)"
echo "OK  target ($new_host) reachable"

echo "== Source and target"
if "$TSX" "$SCRIPT_DIR/db-target.ts" distinct; then
  echo "OK  source ($old_host) and target ($new_host) differ"
else
  fail "source and target look like the same database"
fi

echo "== Target is empty"
check_montreal_empty || fail "target must be empty before restore"

echo "== Vault secrets on source"
# Two queries: a missing vault.secrets would fail the count at parse time.
has_vault="$(query_value OLD_DB_URL "SELECT to_regclass('vault.secrets') IS NOT NULL")"
vault_count=0
if [[ "$has_vault" == "t" ]]; then
  vault_count="$(query_value OLD_DB_URL "SELECT count(*) FROM vault.secrets")" ||
    die "could not count vault.secrets on source ($old_host)"
fi
if [[ "$vault_count" == "0" ]]; then
  echo "OK  0 vault.secrets on source"
else
  fail "source has $vault_count vault.secrets; the dump does not copy vault. Recreate them in the target by hand, then re-run."
fi

echo "== Extensions"
extensions_sql="SELECT extname FROM pg_extension ORDER BY 1"
old_extensions="$(query_value OLD_DB_URL "$extensions_sql")"
new_extensions="$(query_value NEW_DB_URL "$extensions_sql")"
new_available="$(query_value NEW_DB_URL \
  "SELECT name FROM pg_available_extensions ORDER BY 1")"
echo "Source extensions: $(echo "$old_extensions" | paste -sd ' ' -)"
# Re-sort locally: comm needs the shell's collation, not the database's.
missing_extensions="$(comm -23 <(sort <<<"$old_extensions") <(sort <<<"$new_extensions"))"
if [[ -z "$missing_extensions" ]]; then
  echo "OK  target has every source extension installed"
else
  echo "Not installed on target (schema.sql creates them if available): $(echo "$missing_extensions" | paste -sd ' ' -)"
  unavailable="$(comm -23 <(sort <<<"$missing_extensions") <(sort <<<"$new_available"))"
  if [[ -n "$unavailable" ]]; then
    fail "not available on target at all: $(echo "$unavailable" | paste -sd ' ' -)"
  fi
fi

echo
if [[ $failures -gt 0 ]]; then
  die "$failures check(s) failed"
fi
echo "Preflight passed."
