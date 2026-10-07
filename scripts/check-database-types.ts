import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findSchemaDrift,
  formatDifference,
  type DbRelation,
} from "../src/lib/schema-drift/compare.ts";

// Compares relation and column names in the local database's `public` schema against
// src/types/database.ts. Needs a running, migrated local stack (`supabase start`).

// Same version CI installs with supabase/setup-cli; keep the two in step.
const SUPABASE_CLI_VERSION = "2.120.0";

const TYPES_FILE = resolve(process.cwd(), "src/types/database.ts");

// One statement: the CLI sends the SQL as a single prepared statement. information_schema leaves
// out the computed-relationship functions that `gen types` shows as pseudo-columns on views.
const RELATIONS_QUERY = `
SELECT t.table_name AS name,
       CASE t.table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END AS kind,
       json_agg(c.column_name::text ORDER BY c.ordinal_position) AS columns
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
WHERE t.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW')
GROUP BY t.table_name, t.table_type
ORDER BY t.table_name
`;

// `--agent no` pins the plain JSON array; under agent detection the CLI wraps rows in an envelope.
const QUERY_ARGS = [
  "db",
  "query",
  "--local",
  "--output-format",
  "json",
  "--agent",
  "no",
  RELATIONS_QUERY,
];

function getSupabaseCommand(): string[] {
  const probe = spawnSync("supabase", ["--version"], { stdio: "ignore" });
  return probe.error === undefined
    ? ["supabase"]
    : ["npx", `supabase@${SUPABASE_CLI_VERSION}`];
}

function queryDbRelations(): DbRelation[] {
  const [command, ...prefix] = getSupabaseCommand();
  const output = execFileSync(command, [...prefix, ...QUERY_ARGS], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return parseDbRelations(JSON.parse(output));
}

function parseDbRelations(rows: unknown): DbRelation[] {
  if (!Array.isArray(rows) || !rows.every(isDbRelation)) {
    throw new Error(
      "Unexpected output from `supabase db query`: expected an array of " +
        "{ name, kind, columns } rows",
    );
  }
  return rows;
}

function isDbRelation(row: unknown): row is DbRelation {
  if (typeof row !== "object" || row === null) return false;

  const { name, kind, columns } = row as Record<string, unknown>;
  return (
    typeof name === "string" &&
    (kind === "table" || kind === "view") &&
    Array.isArray(columns) &&
    columns.every((column) => typeof column === "string")
  );
}

function main(): number {
  const differences = findSchemaDrift(
    queryDbRelations(),
    readFileSync(TYPES_FILE, "utf8"),
  );
  for (const difference of differences) {
    console.log(formatDifference(difference));
  }

  if (differences.length === 0) {
    console.log("src/types/database.ts matches the database's public schema.");
  }
  return differences.length === 0 ? 0 : 1;
}

process.exitCode = main();
