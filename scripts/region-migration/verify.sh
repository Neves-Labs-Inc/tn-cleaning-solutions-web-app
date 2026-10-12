#!/usr/bin/env bash
# Snapshots both databases and compares them.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:verify [-- --help]

Takes a snapshot of each database (exact count(*) per table in public, auth
and storage; the public schema's objects; migration history), writes them to
MIGRATION_DIR/snapshot-old.json and snapshot-new.json, and compares them.
Read-only on both databases. Prints MATCH and exits 0, or lists every
mismatch and exits 1.

Env: OLD_DB_URL, NEW_DB_URL, MIGRATION_DIR
USAGE
}

handle_help "$@"
require_env OLD_DB_URL NEW_DB_URL MIGRATION_DIR
load_db_env OLD_DB_URL
load_db_env NEW_DB_URL

resolve_migration_dir --create
dir="$MIGRATION_DIR_RESOLVED"

snapshot() {
  local url_var="$1"
  local out="$2"
  echo "== Snapshot of $(db_host "$url_var") -> $out"
  run_psql "$url_var" -A -t -q -f "$SCRIPT_DIR/snapshot.sql" >"$out" ||
    die "snapshot query failed on $(db_host "$url_var")"
  chmod 600 "$out"
}

snapshot OLD_DB_URL "$dir/snapshot-old.json"
snapshot NEW_DB_URL "$dir/snapshot-new.json"

echo "== Comparing"
"$TSX" "$SCRIPT_DIR/compare-snapshots.ts" \
  "$dir/snapshot-old.json" "$dir/snapshot-new.json"
