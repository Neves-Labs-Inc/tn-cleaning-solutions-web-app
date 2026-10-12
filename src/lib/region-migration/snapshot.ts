// Compares two database snapshots taken before and after the region move.
//
// Snapshot JSON shape (the verify script's SQL must emit exactly this; it is
// `MigrationSnapshot` serialized as-is):
//
// {
//   "rowCounts": { "public.jobs": 42, "auth.users": 5, ... },
//       exact count(*) per "schema.table" for every table in the public, auth and
//       storage schemas, except auth.schema_migrations and storage.migrations
//       (the official data dump skips both)
//   "publicObjects": {
//     "relations": [{ "name": "jobs", "kind": "table", "columns": ["id", ...] }],
//         public tables and views; columns in ordinal (attnum) order;
//         kind is "table" or "view"
//     "functions": ["job_total(job_id uuid)"],
//         public functions as proname + "(" + pg_get_function_identity_arguments + ")"
//     "policies": [{ "table": "jobs", "name": "admins manage jobs" }],
//         RLS policies on public tables (pg_policies)
//     "triggers": [{ "table": "jobs", "name": "set_updated_at" }],
//         non-internal triggers on public tables
//     "indexes": ["jobs_pkey"],
//         index names in the public schema
//     "extensions": ["pgcrypto"]
//         every installed extension name (pg_extension.extname)
//   },
//   "migrationVersions": ["20240101000000"]
//       supabase_migrations.schema_migrations.version
// }
//
// List order inside the snapshot does not matter; only column order is compared.

export type RelationKind = "table" | "view";

export type SnapshotRelation = {
  name: string;
  kind: RelationKind;
  columns: string[];
};

export type TableObject = { table: string; name: string };

export type PublicObjects = {
  relations: SnapshotRelation[];
  functions: string[];
  policies: TableObject[];
  triggers: TableObject[];
  indexes: string[];
  extensions: string[];
};

export type MigrationSnapshot = {
  rowCounts: Record<string, number>;
  publicObjects: PublicObjects;
  migrationVersions: string[];
};

export type SnapshotMismatchKind =
  | "row-count"
  | "table"
  | "relation"
  | "relation-kind"
  | "column"
  | "column-order"
  | "function"
  | "policy"
  | "trigger"
  | "index"
  | "extension"
  | "migration-version";

export type SnapshotMismatch = {
  kind: SnapshotMismatchKind;
  subject: string;
  message: string;
};

// Output order: data first, then schema, then history.
const KIND_ORDER: SnapshotMismatchKind[] = [
  "row-count",
  "table",
  "relation",
  "relation-kind",
  "column",
  "column-order",
  "function",
  "policy",
  "trigger",
  "index",
  "extension",
  "migration-version",
];

const RELATION_LABEL: Record<RelationKind, string> = {
  table: "Table",
  view: "View",
};

type Side = "old" | "new";

type Item = { subject: string; label: string };

export function compareSnapshots(
  oldSnapshot: MigrationSnapshot,
  newSnapshot: MigrationSnapshot,
): SnapshotMismatch[] {
  const oldObjects = oldSnapshot.publicObjects;
  const newObjects = newSnapshot.publicObjects;

  const mismatches = [
    ...compareRowCounts(oldSnapshot.rowCounts, newSnapshot.rowCounts),
    ...compareRelations(oldObjects.relations, newObjects.relations),
    ...compareItems(
      "function",
      oldObjects.functions.map(functionItem),
      newObjects.functions.map(functionItem),
    ),
    ...compareItems(
      "policy",
      oldObjects.policies.map(policyItem),
      newObjects.policies.map(policyItem),
    ),
    ...compareItems(
      "trigger",
      oldObjects.triggers.map(triggerItem),
      newObjects.triggers.map(triggerItem),
    ),
    ...compareItems(
      "index",
      oldObjects.indexes.map(indexItem),
      newObjects.indexes.map(indexItem),
    ),
    ...compareItems(
      "extension",
      oldObjects.extensions.map(extensionItem),
      newObjects.extensions.map(extensionItem),
    ),
    ...compareItems(
      "migration-version",
      oldSnapshot.migrationVersions.map(migrationItem),
      newSnapshot.migrationVersions.map(migrationItem),
    ),
  ];
  return mismatches.toSorted(compareMismatches);
}

function compareRowCounts(
  oldCounts: Record<string, number>,
  newCounts: Record<string, number>,
): SnapshotMismatch[] {
  const missingTables = [
    ...missingTablesFrom(oldCounts, newCounts, "old"),
    ...missingTablesFrom(newCounts, oldCounts, "new"),
  ];
  const countDifferences = Object.entries(oldCounts).flatMap(
    ([table, oldCount]) => {
      const newCount = newCounts[table];
      if (newCount === undefined || newCount === oldCount) return [];
      return [
        {
          kind: "row-count" as const,
          subject: table,
          message: `Row count differs for ${table}: old ${oldCount}, new ${newCount}`,
        },
      ];
    },
  );
  return [...missingTables, ...countDifferences];
}

function missingTablesFrom(
  present: Record<string, number>,
  other: Record<string, number>,
  side: Side,
): SnapshotMismatch[] {
  return Object.entries(present)
    .filter(([table]) => !(table in other))
    .map(([table, count]) => ({
      kind: "table",
      subject: table,
      message:
        `Table ${table} exists in ${side} but not in ${otherSide(side)} ` +
        `(${side} has ${count} rows)`,
    }));
}

function compareRelations(
  oldRelations: SnapshotRelation[],
  newRelations: SnapshotRelation[],
): SnapshotMismatch[] {
  const newByName = new Map(newRelations.map((r) => [r.name, r]));
  const oldByName = new Map(oldRelations.map((r) => [r.name, r]));

  const missingRelations = [
    ...missingRelationsFrom(oldRelations, newByName, "old"),
    ...missingRelationsFrom(newRelations, oldByName, "new"),
  ];
  const changedRelations = oldRelations.flatMap((oldRelation) => {
    const newRelation = newByName.get(oldRelation.name);
    return newRelation === undefined
      ? []
      : compareRelation(oldRelation, newRelation);
  });
  return [...missingRelations, ...changedRelations];
}

function missingRelationsFrom(
  present: SnapshotRelation[],
  other: Map<string, SnapshotRelation>,
  side: Side,
): SnapshotMismatch[] {
  return present
    .filter((relation) => !other.has(relation.name))
    .map((relation) => ({
      kind: "relation",
      subject: relation.name,
      message:
        `${RELATION_LABEL[relation.kind]} public.${relation.name} ` +
        `exists in ${side} but not in ${otherSide(side)}`,
    }));
}

function compareRelation(
  oldRelation: SnapshotRelation,
  newRelation: SnapshotRelation,
): SnapshotMismatch[] {
  const { name } = oldRelation;
  const kindChange: SnapshotMismatch[] =
    oldRelation.kind === newRelation.kind
      ? []
      : [
          {
            kind: "relation-kind",
            subject: name,
            message:
              `Relation public.${name} is a ${oldRelation.kind} in old ` +
              `but a ${newRelation.kind} in new`,
          },
        ];

  const columnItems = (relation: SnapshotRelation): Item[] =>
    relation.columns.map((column) => ({
      subject: `${name}.${column}`,
      label: `Column public.${name}.${column}`,
    }));
  const columnChanges = compareItems(
    "column",
    columnItems(oldRelation),
    columnItems(newRelation),
  );

  // Order only matters once both sides hold the same columns.
  const hasOrderChange =
    columnChanges.length === 0 &&
    oldRelation.columns.join("\0") !== newRelation.columns.join("\0");
  const orderChange: SnapshotMismatch[] = hasOrderChange
    ? [
        {
          kind: "column-order",
          subject: name,
          message:
            `Column order differs for public.${name}: ` +
            `old (${oldRelation.columns.join(", ")}), ` +
            `new (${newRelation.columns.join(", ")})`,
        },
      ]
    : [];

  return [...kindChange, ...columnChanges, ...orderChange];
}

function compareItems(
  kind: SnapshotMismatchKind,
  oldItems: Item[],
  newItems: Item[],
): SnapshotMismatch[] {
  return [
    ...missingItemsFrom(kind, oldItems, newItems, "old"),
    ...missingItemsFrom(kind, newItems, oldItems, "new"),
  ];
}

function missingItemsFrom(
  kind: SnapshotMismatchKind,
  present: Item[],
  other: Item[],
  side: Side,
): SnapshotMismatch[] {
  const otherSubjects = new Set(other.map((item) => item.subject));
  return present
    .filter((item) => !otherSubjects.has(item.subject))
    .map((item) => ({
      kind,
      subject: item.subject,
      message: `${item.label} exists in ${side} but not in ${otherSide(side)}`,
    }));
}

function functionItem(signature: string): Item {
  return { subject: signature, label: `Function public.${signature}` };
}

function policyItem(policy: TableObject): Item {
  return {
    subject: `${policy.table}.${policy.name}`,
    label: `Policy "${policy.name}" on public.${policy.table}`,
  };
}

function triggerItem(trigger: TableObject): Item {
  return {
    subject: `${trigger.table}.${trigger.name}`,
    label: `Trigger ${trigger.name} on public.${trigger.table}`,
  };
}

function indexItem(name: string): Item {
  return { subject: name, label: `Index public.${name}` };
}

function extensionItem(name: string): Item {
  return { subject: name, label: `Extension ${name}` };
}

function migrationItem(version: string): Item {
  return { subject: version, label: `Migration ${version}` };
}

function otherSide(side: Side): Side {
  return side === "old" ? "new" : "old";
}

// Plain code-point comparison, so the order never depends on the machine's locale.
function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareMismatches(a: SnapshotMismatch, b: SnapshotMismatch): number {
  return (
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    compareStrings(a.subject, b.subject) ||
    compareStrings(a.message, b.message)
  );
}
