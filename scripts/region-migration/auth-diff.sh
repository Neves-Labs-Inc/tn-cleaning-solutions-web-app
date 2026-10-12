#!/usr/bin/env bash
# Diffs both projects' auth config via the Management API (read-only).
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<'USAGE'
Usage: npm run migration:auth-diff [-- --help]

GETs https://api.supabase.com/v1/projects/<ref>/config/auth for both projects
and prints the fields that differ. Secret-like values are masked; values the
API redacts are listed as "verify manually". Read-only: no PATCH or other write.
Exits 1 if any field differs outright, 0 otherwise.

The token is read from env inside the process and sent only as a request
header; it never appears in argv or output.

Env: SUPABASE_ACCESS_TOKEN, OLD_PROJECT_REF, NEW_PROJECT_REF
USAGE
}

handle_help "$@"
require_env SUPABASE_ACCESS_TOKEN OLD_PROJECT_REF NEW_PROJECT_REF

echo "== Auth config: $OLD_PROJECT_REF (old) vs $NEW_PROJECT_REF (new)"
"$TSX" "$SCRIPT_DIR/auth-diff.ts"
