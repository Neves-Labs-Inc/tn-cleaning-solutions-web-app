import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findSchemaDrift,
  formatDifference,
  type DbRelation,
} from "../../src/lib/schema-drift/compare.ts";

// Shaped like src/types/database.ts: narrowed unions, Insert/Update, Relationships, Functions.
const TYPES_SOURCE = `
export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          id: string
          name: string
          status: 'active' | 'paused'
        }
        Insert: {
          id?: string
          name: string
          status?: 'active' | 'paused'
        }
        Update: {
          id?: string
          name?: string
          status?: 'active' | 'paused'
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          notes: string
        }
        Insert: { id?: string; notes: string }
        Update: { id?: string; notes?: string }
        Relationships: []
      }
    }
    Views: {
      jobs_view: {
        Row: {
          id: string
          name: string | null
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
`;

const MATCHING_DB: DbRelation[] = [
  { name: "jobs", kind: "table", columns: ["id", "name", "status"] },
  { name: "clients", kind: "table", columns: ["id", "notes"] },
  { name: "jobs_view", kind: "view", columns: ["id", "name"] },
];

function withRelation(
  name: string,
  change: (relation: DbRelation) => DbRelation | null,
): DbRelation[] {
  return MATCHING_DB.flatMap((relation) => {
    if (relation.name !== name) return [relation];
    const changed = change(relation);
    return changed === null ? [] : [changed];
  });
}

test("reports no drift when every relation and column matches", () => {
  assert.deepEqual(findSchemaDrift(MATCHING_DB, TYPES_SOURCE), []);
});

test("ignores nullability and string-union differences", () => {
  const widenedSource = TYPES_SOURCE.replaceAll(
    "'active' | 'paused'",
    "string",
  ).replace("name: string | null", "name: string");

  assert.notEqual(widenedSource, TYPES_SOURCE);
  assert.deepEqual(findSchemaDrift(MATCHING_DB, widenedSource), []);
});

test("reports a database column missing from database.ts", () => {
  const db = withRelation("jobs", (jobs) => ({
    ...jobs,
    columns: [...jobs.columns, "foo"],
  }));

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "column",
      relation: "jobs",
      relationKind: "table",
      column: "foo",
      missingFrom: "database.ts",
    },
  ]);
});

test("reports a database.ts column missing from the database", () => {
  const db = withRelation("jobs", (jobs) => ({
    ...jobs,
    columns: ["id", "name"],
  }));

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "column",
      relation: "jobs",
      relationKind: "table",
      column: "status",
      missingFrom: "database",
    },
  ]);
});

test("reports a database table missing from database.ts", () => {
  const db: DbRelation[] = [
    ...MATCHING_DB,
    { name: "invoices", kind: "table", columns: ["id"] },
  ];

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "relation",
      relation: "invoices",
      relationKind: "table",
      column: null,
      missingFrom: "database.ts",
    },
  ]);
});

test("reports a database.ts table missing from the database", () => {
  const db = withRelation("clients", () => null);

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "relation",
      relation: "clients",
      relationKind: "table",
      column: null,
      missingFrom: "database",
    },
  ]);
});

test("reports a database view missing from database.ts", () => {
  const db: DbRelation[] = [
    ...MATCHING_DB,
    { name: "clients_view", kind: "view", columns: ["id"] },
  ];

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "relation",
      relation: "clients_view",
      relationKind: "view",
      column: null,
      missingFrom: "database.ts",
    },
  ]);
});

test("reports a database.ts view missing from the database", () => {
  const db = withRelation("jobs_view", () => null);

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "relation",
      relation: "jobs_view",
      relationKind: "view",
      column: null,
      missingFrom: "database",
    },
  ]);
});

test("reports a relation listed in the wrong section on both sides", () => {
  const db = withRelation("jobs_view", (view) => ({ ...view, kind: "table" }));

  assert.deepEqual(findSchemaDrift(db, TYPES_SOURCE), [
    {
      kind: "relation",
      relation: "jobs_view",
      relationKind: "table",
      column: null,
      missingFrom: "database.ts",
    },
    {
      kind: "relation",
      relation: "jobs_view",
      relationKind: "view",
      column: null,
      missingFrom: "database",
    },
  ]);
});

test("throws when the source has no Database type", () => {
  assert.throws(
    () => findSchemaDrift(MATCHING_DB, "export type Other = {}"),
    /Database/,
  );
});

test("formats a missing column as a GitHub error annotation", () => {
  assert.equal(
    formatDifference({
      kind: "column",
      relation: "jobs",
      relationKind: "table",
      column: "foo",
      missingFrom: "database.ts",
    }),
    "::error::Column public.jobs.foo exists in the database but not in " +
      "src/types/database.ts. Add it to the Row/Insert/Update types.",
  );
});
