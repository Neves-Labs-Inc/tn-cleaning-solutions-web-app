#!/usr/bin/env bash
# Restores the dump into the target (Montreal) in one transaction.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:restore [-- --help]

Refuses unless source and target are different databases and the target is
empty, then restores MIGRATION_DIR into the target as ONE transaction:
  psql --single-transaction -v ON_ERROR_STOP=1 \
    -f roles.sql -f schema.sql -f history_schema.sql \
    -c 'SET session_replication_role = replica' \
    -f data.sql -f history_data.sql
Any error rolls everything back; the script then re-checks the target is empty.

Env: OLD_DB_URL, NEW_DB_URL, MIGRATION_DIR,
     OLD_PROJECT_REF, NEW_PROJECT_REF (must match the URLs' projects)
USAGE
}

handle_help "$@"
require_env OLD_DB_URL NEW_DB_URL OLD_PROJECT_REF NEW_PROJECT_REF MIGRATION_DIR
load_db_env OLD_DB_URL
load_db_env NEW_DB_URL

resolve_migration_dir
dir="$MIGRATION_DIR_RESOLVED"
host="$(db_host NEW_DB_URL)"

echo "== Guards"
assert_distinct_targets
check_montreal_empty || die "refusing to restore into a non-empty target"
[[ -f "$dir/$DUMP_COMPLETE_MARKER" ]] ||
  die "no complete dump in $dir; run npm run migration:dump first"
for file in "${DUMP_FILES[@]}"; do
  [[ -s "$dir/$file" ]] || die "$dir/$file is missing or empty"
done

echo "== Restoring into $host (one transaction)"
SECONDS=0
cd "$dir" || die "cannot enter $dir"
if with_db_password NEW_DB_URL psql -X --quiet --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql -f history_schema.sql \
  -c 'SET session_replication_role = replica' \
  -f data.sql -f history_data.sql \
  --dbname "$NEW_DB_URL_NOPW"; then
  echo "Restore committed in ${SECONDS}s. Next: npm run migration:verify"
  exit 0
fi

echo >&2
echo "FAIL restore failed after ${SECONDS}s (psql error above)." >&2
echo "     The transaction was rolled back: nothing was committed to $host." >&2
echo "== Re-checking the target is still empty"
if check_montreal_empty; then
  echo "Target is empty; a retry starts clean."
else
  echo "Target is NOT empty: see the runbook's restore-failure path." >&2
fi
exit 1
