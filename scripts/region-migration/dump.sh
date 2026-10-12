#!/usr/bin/env bash
# Dumps the source (Oregon) database with Supabase's official commands.
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:dump [-- --help]

Runs the official `supabase db dump` commands (supabase@2.120.0 via npx; needs
Docker) against the source into MIGRATION_DIR:
  roles.sql           --role-only
  schema.sql
  data.sql            --use-copy --data-only, minus storage vector tables
  history_schema.sql  --schema supabase_migrations
  history_data.sql    --use-copy --data-only --schema supabase_migrations

Then applies the guide's two documented fixes, commenting out:
  - ALTER ... OWNER TO "supabase_admin" lines in schema.sql
  - GRANT "postgres" TO "cli_login_postgres" in roles.sql
and reports lines changed, file sizes and elapsed time. Files are mode 600.

Env: OLD_DB_URL, OLD_PROJECT_REF (must match the URL's project), MIGRATION_DIR
USAGE
}

handle_help "$@"
require_env OLD_DB_URL OLD_PROJECT_REF MIGRATION_DIR
load_db_env OLD_DB_URL

resolve_migration_dir --create
dir="$MIGRATION_DIR_RESOLVED"
host="$(db_host OLD_DB_URL)"

# A failed run must not leave an older complete-looking set behind.
rm -f "$dir/$DUMP_COMPLETE_MARKER"
for file in "${DUMP_FILES[@]}"; do
  rm -f "$dir/$file"
done

# Run from MIGRATION_DIR so the CLI never writes temp files into the repo.
cd "$dir" || die "cannot enter $dir"
SECONDS=0

dump() {
  local file="$1"
  shift
  echo "== Dumping $file from $host"
  with_db_password OLD_DB_URL npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump \
    --db-url "$OLD_DB_URL_NOPW" -f "$dir/$file" "$@" ||
    die "supabase db dump failed for $file"
}

dump roles.sql --role-only
dump schema.sql
dump data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
dump history_schema.sql --schema supabase_migrations
dump history_data.sql --use-copy --data-only --schema supabase_migrations

# Usage: comment_out FILE ERE. Prefixes matching lines with "-- "; prints the count.
comment_out() {
  local file="$1"
  local pattern="$2"
  local count
  count="$(grep -cE "$pattern" "$file" || true)"
  awk -v pattern="$pattern" '$0 ~ pattern { print "-- " $0; next } { print }' \
    "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
  echo "$count"
}

echo "== Applying the documented fixes"
owner_count="$(comment_out "$dir/schema.sql" '^ALTER .* OWNER TO "supabase_admin";')"
echo "schema.sql: commented out $owner_count ALTER ... OWNER TO \"supabase_admin\" line(s)"
if [[ "$owner_count" == "0" ]]; then
  echo "WARN no supabase_admin owner lines matched. Expected some on a hosted project;" >&2
  echo "     if restore fails on ownership, check schema.sql for OWNER TO lines." >&2
fi
grant_count="$(comment_out "$dir/roles.sql" '^GRANT "postgres" TO "cli_login_postgres"')"
echo "roles.sql: commented out $grant_count GRANT \"postgres\" TO \"cli_login_postgres\" line(s)"

echo "== Files"
for file in "${DUMP_FILES[@]}"; do
  chmod 600 "$dir/$file"
  printf '%-20s %12s bytes\n' "$file" "$(wc -c <"$dir/$file" | tr -d ' ')"
done

touch "$dir/$DUMP_COMPLETE_MARKER"
echo "Dump complete in ${SECONDS}s into $dir"
