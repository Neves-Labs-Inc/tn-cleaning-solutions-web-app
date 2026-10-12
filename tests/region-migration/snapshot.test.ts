import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareSnapshots,
  type MigrationSnapshot,
} from "../../src/lib/region-migration/snapshot.ts";

const OLD: MigrationSnapshot = {
  rowCounts: {
    "public.jobs": 42,
    "public.clients": 7,
    "auth.users": 5,
    "storage.objects": 0,
  },
  publicObjects: {
    relations: [
      { name: "jobs", kind: "table", columns: ["id", "client_id", "name"] },
      { name: "clients", kind: "table", columns: ["id", "name"] },
      { name: "jobs_view", kind: "view", columns: ["id", "name"] },
    ],
    functions: ["is_admin()", "job_total(job_id uuid)"],
    policies: [{ table: "jobs", name: "admins manage jobs" }],
    triggers: [{ table: "jobs", name: "set_updated_at" }],
    indexes: ["jobs_pkey", "clients_pkey"],
    extensions: ["pgcrypto", "uuid-ossp"],
  },
  migrationVersions: ["20240101000000", "20240201000000"],
};

function copyOf(snapshot: MigrationSnapshot): MigrationSnapshot {
  return structuredClone(snapshot);
}

function messagesOf(newSnapshot: MigrationSnapshot): string[] {
  return compareSnapshots(OLD, newSnapshot).map((m) => m.message);
}

test("reports nothing when the snapshots are identical", () => {
  assert.deepEqual(compareSnapshots(OLD, copyOf(OLD)), []);
});

test("ignores the order of rows within each list", () => {
  const original = copyOf(OLD);
  original.publicObjects.policies.push({
    table: "clients",
    name: "admins manage clients",
  });
  original.publicObjects.triggers.push({
    table: "clients",
    name: "set_updated_at",
  });

  const reordered = copyOf(original);
  reordered.rowCounts = Object.fromEntries(
    Object.entries(reordered.rowCounts).reverse(),
  );
  reordered.publicObjects.relations.reverse();
  reordered.publicObjects.functions.reverse();
  reordered.publicObjects.policies.reverse();
  reordered.publicObjects.triggers.reverse();
  reordered.publicObjects.indexes.reverse();
  reordered.publicObjects.extensions.reverse();
  reordered.migrationVersions.reverse();

  assert.deepEqual(compareSnapshots(original, reordered), []);
});

test("reports a row-count difference", () => {
  const changed = copyOf(OLD);
  changed.rowCounts["auth.users"] = 4;

  assert.deepEqual(compareSnapshots(OLD, changed), [
    {
      kind: "row-count",
      subject: "auth.users",
      message: "Row count differs for auth.users: old 5, new 4",
    },
  ]);
});

test("reports a table missing from either side", () => {
  const changed = copyOf(OLD);
  delete changed.rowCounts["public.clients"];
  changed.rowCounts["public.extra"] = 0;

  assert.deepEqual(messagesOf(changed), [
    "Table public.clients exists in old but not in new (old has 7 rows)",
    "Table public.extra exists in new but not in old (new has 0 rows)",
  ]);
});

test("reports a missing and an extra column", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.relations[0].columns = ["id", "name", "notes"];

  assert.deepEqual(messagesOf(changed), [
    "Column public.jobs.client_id exists in old but not in new",
    "Column public.jobs.notes exists in new but not in old",
  ]);
});

test("reports columns in a different order", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.relations[1].columns = ["name", "id"];

  assert.deepEqual(messagesOf(changed), [
    "Column order differs for public.clients: old (id, name), new (name, id)",
  ]);
});

test("reports a missing relation and a relation whose kind changed", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.relations = [
    { name: "jobs", kind: "table", columns: ["id", "client_id", "name"] },
    { name: "jobs_view", kind: "table", columns: ["id", "name"] },
  ];

  assert.deepEqual(messagesOf(changed), [
    "Table public.clients exists in old but not in new",
    "Relation public.jobs_view is a view in old but a table in new",
  ]);
});

test("reports a missing and an extra function", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.functions = ["is_admin()", "job_total(job_id text)"];

  assert.deepEqual(messagesOf(changed), [
    "Function public.job_total(job_id text) exists in new but not in old",
    "Function public.job_total(job_id uuid) exists in old but not in new",
  ]);
});

test("reports a missing and an extra policy", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.policies = [{ table: "clients", name: "admins manage jobs" }];

  assert.deepEqual(messagesOf(changed), [
    'Policy "admins manage jobs" on public.clients exists in new but not in old',
    'Policy "admins manage jobs" on public.jobs exists in old but not in new',
  ]);
});

test("reports a missing and an extra trigger", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.triggers = [{ table: "clients", name: "audit" }];

  assert.deepEqual(messagesOf(changed), [
    "Trigger audit on public.clients exists in new but not in old",
    "Trigger set_updated_at on public.jobs exists in old but not in new",
  ]);
});

test("reports a missing and an extra index", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.indexes = ["jobs_pkey", "jobs_name_idx"];

  assert.deepEqual(messagesOf(changed), [
    "Index public.clients_pkey exists in old but not in new",
    "Index public.jobs_name_idx exists in new but not in old",
  ]);
});

test("reports a missing and an extra extension", () => {
  const changed = copyOf(OLD);
  changed.publicObjects.extensions = ["pgcrypto", "pg_trgm"];

  assert.deepEqual(messagesOf(changed), [
    "Extension pg_trgm exists in new but not in old",
    "Extension uuid-ossp exists in old but not in new",
  ]);
});

test("reports a missing and an extra migration version", () => {
  const changed = copyOf(OLD);
  changed.migrationVersions = ["20240101000000", "20240301000000"];

  assert.deepEqual(messagesOf(changed), [
    "Migration 20240201000000 exists in old but not in new",
    "Migration 20240301000000 exists in new but not in old",
  ]);
});

test("orders mismatches by category, then subject", () => {
  const changed = copyOf(OLD);
  changed.migrationVersions = ["20240101000000"];
  changed.publicObjects.extensions = ["pgcrypto"];
  changed.rowCounts["public.jobs"] = 41;
  changed.rowCounts["auth.users"] = 6;

  assert.deepEqual(
    compareSnapshots(OLD, changed).map((m) => [m.kind, m.subject]),
    [
      ["row-count", "auth.users"],
      ["row-count", "public.jobs"],
      ["extension", "uuid-ossp"],
      ["migration-version", "20240201000000"],
    ],
  );
});
