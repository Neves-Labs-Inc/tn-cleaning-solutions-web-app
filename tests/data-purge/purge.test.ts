import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Integration test for scripts/data-purge. It runs only against local Supabase, and every case
// ends in a rollback: the fixture cases roll back themselves, the runner case relies on the
// runner's own dry run. It never passes confirm=PURGE.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PURGE_BODY = resolve(REPO_ROOT, "scripts/data-purge/purge-body.sql");
const PURGE_RUNNER = resolve(REPO_ROOT, "scripts/data-purge/purge.sql");
const FIXTURES = resolve(REPO_ROOT, "tests/data-purge/fixtures.sql");

const DB_URL_VAR = "PURGE_TEST_DB_URL";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
// libpq lets these query parameters replace the URL's host, which would dodge the host check.
const HOST_OVERRIDE_PARAMS = ["host", "hostaddr", "service"];

type DbTarget =
  | { kind: "unset" }
  | { kind: "refused"; reason: string }
  | { kind: "local"; url: string };

type PsqlRun = { status: number | null; stdout: string; stderr: string };

type CountRow = { label: string; action: "remove" | "keep"; rows: number };

function readDbTarget(): DbTarget {
  const rawUrl = process.env[DB_URL_VAR] ?? "";
  if (rawUrl === "") return { kind: "unset" };

  const parsed = URL.parse(rawUrl);
  let target: DbTarget = { kind: "local", url: rawUrl };
  // Never echo the URL itself: it may carry a password.
  if (parsed === null || !POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    target = {
      kind: "refused",
      reason: `${DB_URL_VAR} is not a postgresql:// connection URL`,
    };
  } else if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    target = {
      kind: "refused",
      reason:
        `${DB_URL_VAR} points at host "${parsed.hostname}". The purge test ` +
        "runs only against local Supabase (127.0.0.1, localhost or ::1).",
    };
  } else if (
    HOST_OVERRIDE_PARAMS.some((param) => parsed.searchParams.has(param))
  ) {
    target = {
      kind: "refused",
      reason: `${DB_URL_VAR} must not set host, hostaddr or service as a query parameter`,
    };
  }
  return target;
}

const TARGET = readDbTarget();
const SKIP_REASONS: Record<DbTarget["kind"], string | false> = {
  unset: `${DB_URL_VAR} is unset`,
  refused: `${DB_URL_VAR} is not a local database`,
  local: false,
};
const SKIP = SKIP_REASONS[TARGET.kind];

function getLocalUrl(): string {
  if (TARGET.kind !== "local") throw new Error("no local database target");
  return TARGET.url;
}

// PG* variables (PGHOST, PGSERVICE...) could redirect psql, so the child never sees them.
// GSS encryption is off because macOS can stall about a minute per connect negotiating it.
function getPsqlEnv(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
    ),
    PGGSSENCMODE: "disable",
  };
}

function runPsql(args: string[], input = ""): PsqlRun {
  const result = spawnSync("psql", ["-X", "-d", getLocalUrl(), ...args], {
    input,
    encoding: "utf8",
    env: getPsqlEnv(),
    cwd: REPO_ROOT,
  });
  if (result.error) {
    throw new Error(`could not run psql: ${result.error.message}`);
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// One psql session reading `script` from stdin, stopping at the first error.
function runSession(script: string): PsqlRun {
  const run = runPsql(["-v", "ON_ERROR_STOP=1", "-f", "-"], script);
  assert.equal(run.status, 0, `psql failed:\n${run.stderr}`);
  return run;
}

function includeFile(path: string): string {
  return `\\i '${path}'`;
}

// Reads the aligned count table printed after a heading that contains `marker`.
function readCountTables(output: string, marker: string): CountRow[][] {
  const sections = output.split("\n== ").slice(1);
  return sections
    .filter((section) => section.startsWith(marker))
    .map((section) =>
      section.split("\n").flatMap((line) => {
        const match =
          /^\s*([a-z_]+(?: \([a-z ]+\))?)\s*\|\s*(remove|keep)\s*\|\s*(\d+)\s*$/.exec(
            line,
          );
        return match === null
          ? []
          : [
              {
                label: match[1],
                action: match[2] as CountRow["action"], // the regex only matches these two
                rows: Number(match[3]),
              },
            ];
      }),
    );
}

function toCountMap(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.label, row.rows]));
}

// Values printed by assertion queries as `ASSERT:<name>=<value>`.
function readAssertions(output: string): Record<string, string> {
  return Object.fromEntries(
    [...output.matchAll(/ASSERT:(\w+)=(\S*)/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

const FIXTURE_COUNTS_BEFORE = {
  appointments: 7,
  recurrence_series: 2,
  appointment_employees: 3,
  invoice_appointments: 4,
  invoices: 6,
  clock_corrections: 1,
  odd_duration_acknowledgements: 1,
  invoice_number_counters: 1,
  "jobs (archived)": 2,
  "client_job_pricing (archived jobs)": 3,
  clients: 2,
  client_locations: 2,
  employees: 2,
  "jobs (active)": 2,
  "client_job_pricing (active jobs)": 2,
  payment_methods: 2,
};

const FIXTURE_COUNTS_AFTER = {
  appointments: 0,
  recurrence_series: 0,
  appointment_employees: 0,
  invoice_appointments: 0,
  invoices: 0,
  clock_corrections: 0,
  odd_duration_acknowledgements: 0,
  invoice_number_counters: 0,
  "jobs (archived)": 0,
  "client_job_pricing (archived jobs)": 0,
  clients: 2,
  client_locations: 2,
  employees: 2,
  "jobs (active)": 2,
  "client_job_pricing (active jobs)": 2,
  payment_methods: 2,
};

const PURGED_TABLES = [
  "appointments",
  "recurrence_series",
  "appointment_employees",
  "invoice_appointments",
  "invoices",
  "clock_corrections",
  "odd_duration_acknowledgements",
  "invoice_number_counters",
];

const KEPT_TABLES = [
  "clients",
  "client_locations",
  "employees",
  "jobs",
  "client_job_pricing",
  "payment_methods",
];

// Every kept row in full (active jobs and their rates only), so "contents unchanged" compares
// whole rows, not just counts.
const KEPT_FINGERPRINT_SQL = `select md5(string_agg(row_text, '|' order by row_text)) from (
  select 'clients:' || t::text as row_text from public.clients t
  union all select 'client_locations:' || t::text from public.client_locations t
  union all select 'employees:' || t::text from public.employees t
  union all select 'jobs:' || t::text from public.jobs t where t.is_archived is not true
  union all select 'client_job_pricing:' || t::text from public.client_job_pricing t
    join public.jobs j on j.id = t.job_id where j.is_archived is not true
  union all select 'payment_methods:' || t::text from public.payment_methods t
) kept`;

const ALL_TABLE_COUNTS_SQL = `select string_agg(name || ':' || n, ',' order by name) from (${[
  ...PURGED_TABLES,
  ...KEPT_TABLES,
]
  .map(
    (table) => `select '${table}' as name, count(*) as n from public.${table}`,
  )
  .join(" union all ")}) counts`;

test(
  `${DB_URL_VAR} points at a local database`,
  {
    skip: TARGET.kind === "unset" ? SKIP : false,
  },
  () => {
    if (TARGET.kind === "refused") assert.fail(TARGET.reason);
  },
);

test(
  "empties every purged table and removes archived jobs with their rates",
  {
    skip: SKIP,
  },
  () => {
    const run = runSession(`
begin;
${includeFile(FIXTURES)}
${includeFile(PURGE_BODY)}
select 'ASSERT:surviving_jobs=' || string_agg(hourly_rate_cents::text, ';' order by hourly_rate_cents)
  from public.jobs;
select 'ASSERT:surviving_rates=' || string_agg(hourly_rate_cents::text, ';' order by hourly_rate_cents)
  from public.client_job_pricing;
rollback;
`);

    const [before] = readCountTables(run.stdout, "BEFORE");
    const [after] = readCountTables(run.stdout, "AFTER");
    assert.deepEqual(toCountMap(before), FIXTURE_COUNTS_BEFORE);
    assert.deepEqual(toCountMap(after), FIXTURE_COUNTS_AFTER);
    const assertions = readAssertions(run.stdout);
    assert.equal(assertions.surviving_jobs, "4000;4500");
    assert.equal(assertions.surviving_rates, "4100;4600");
  },
);

test(
  "leaves clients, locations, employees, active jobs, their rates and payment methods unchanged",
  {
    skip: SKIP,
  },
  () => {
    const run = runSession(`
begin;
${includeFile(FIXTURES)}
select 'ASSERT:kept_before=' || (${KEPT_FINGERPRINT_SQL});
${includeFile(PURGE_BODY)}
select 'ASSERT:kept_after=' || (${KEPT_FINGERPRINT_SQL});
rollback;
`);

    const assertions = readAssertions(run.stdout);
    assert.match(assertions.kept_before, /^[0-9a-f]{32}$/);
    assert.equal(assertions.kept_after, assertions.kept_before);
  },
);

test(
  "a second run in the same transaction succeeds and finds nothing to remove",
  {
    skip: SKIP,
  },
  () => {
    const run = runSession(`
begin;
${includeFile(FIXTURES)}
${includeFile(PURGE_BODY)}
${includeFile(PURGE_BODY)}
rollback;
`);

    const befores = readCountTables(run.stdout, "BEFORE");
    assert.equal(befores.length, 2);
    assert.deepEqual(toCountMap(befores[1]), FIXTURE_COUNTS_AFTER);
  },
);

test(
  "aborts at the truncate when an unknown table references appointments",
  {
    skip: SKIP,
  },
  () => {
    // No ON_ERROR_STOP: the session must carry on to roll back to the savepoint and look.
    const run = runPsql(
      ["-f", "-"],
      `
begin;
${includeFile(FIXTURES)}
select 'ASSERT:counts_before=' || (${ALL_TABLE_COUNTS_SQL});
select 'ASSERT:kept_before=' || (${KEPT_FINGERPRINT_SQL});
savepoint before_purge;
create table public.purge_test_drift (
  appointment_id uuid references public.appointments (id)
);
${includeFile(PURGE_BODY)}
rollback to savepoint before_purge;
select 'ASSERT:counts_after=' || (${ALL_TABLE_COUNTS_SQL});
select 'ASSERT:kept_after=' || (${KEPT_FINGERPRINT_SQL});
rollback;
`,
    );

    assert.match(
      run.stderr,
      /cannot truncate a table referenced in a foreign key constraint/,
    );
    assert.match(run.stderr, /purge_test_drift/);
    assert.deepEqual(readCountTables(run.stdout, "AFTER").flat(), []);
    const assertions = readAssertions(run.stdout);
    assert.equal(
      assertions.counts_before,
      "appointment_employees:3,appointments:7,client_job_pricing:5," +
        "client_locations:2,clients:2,clock_corrections:1,employees:2," +
        "invoice_appointments:4,invoice_number_counters:1,invoices:6,jobs:4," +
        "odd_duration_acknowledgements:1,payment_methods:2,recurrence_series:2",
    );
    assert.equal(assertions.counts_after, assertions.counts_before);
    assert.equal(assertions.kept_after, assertions.kept_before);
  },
);

for (const confirmArgs of [
  [],
  ["-v", "confirm=purge"],
  ["-v", "confirm=yes"],
]) {
  const label =
    confirmArgs.length === 0 ? "without confirm" : `with ${confirmArgs[1]}`;

  test(
    `the runner ${label} purges in a dry run and changes nothing`,
    {
      skip: SKIP,
    },
    () => {
      const countsSql = `select 'ASSERT:counts=' || (${ALL_TABLE_COUNTS_SQL});`;
      const countsBefore = readAssertions(runSession(countsSql).stdout).counts;

      const run = runPsql([...confirmArgs, "-f", PURGE_RUNNER]);

      assert.equal(run.status, 0, `runner failed:\n${run.stderr}`);
      assert.match(run.stdout, /host: 127\.0\.0\.1|host: localhost|host: ::1/);
      assert.match(run.stdout, /database: postgres/);
      assert.match(run.stdout, /mode: DRY RUN/);
      assert.match(run.stdout, /DRY RUN: rolled back, nothing changed/);
      assert.doesNotMatch(run.stdout, /COMMITTED/);
      const [after] = readCountTables(run.stdout, "AFTER");
      const removedAfter = after.filter((row) => row.action === "remove");
      assert.equal(removedAfter.length, 10);
      assert.ok(removedAfter.every((row) => row.rows === 0));

      const countsAfter = readAssertions(runSession(countsSql).stdout).counts;
      assert.equal(countsAfter, countsBefore);
    },
  );
}
