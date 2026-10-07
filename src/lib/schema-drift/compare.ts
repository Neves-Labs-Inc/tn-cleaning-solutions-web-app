import ts from "typescript";

// Name-level drift check between the database `public` schema and the hand-maintained
// src/types/database.ts. Only relation and column names are compared: that file narrows
// nullability and CHECK constraints on purpose, so an exact diff against `gen types` cannot work.

export type RelationKind = "table" | "view";

export type DbRelation = {
  name: string;
  kind: RelationKind;
  columns: string[];
};

export type SchemaSide = "database" | "database.ts";

export type SchemaDifference = {
  kind: "relation" | "column";
  relation: string;
  relationKind: RelationKind;
  column: string | null;
  missingFrom: SchemaSide;
};

const TYPES_PATH = "src/types/database.ts";

const SECTION_BY_KIND: Record<RelationKind, string> = {
  table: "Tables",
  view: "Views",
};

export function findSchemaDrift(
  dbRelations: DbRelation[],
  typesSource: string,
): SchemaDifference[] {
  const typeRelations = readTypeRelations(typesSource);
  const dbByKey = new Map(dbRelations.map((r) => [relationKey(r), r]));
  const typesByKey = new Map(typeRelations.map((r) => [relationKey(r), r]));

  const missingRelations = [
    ...missingFrom(dbRelations, typesByKey, "database.ts"),
    ...missingFrom(typeRelations, dbByKey, "database"),
  ];
  const missingColumns = dbRelations.flatMap((dbRelation) => {
    const typeRelation = typesByKey.get(relationKey(dbRelation));
    if (typeRelation === undefined) return [];
    return [
      ...missingColumnsFrom(dbRelation, typeRelation, "database.ts"),
      ...missingColumnsFrom(typeRelation, dbRelation, "database"),
    ];
  });

  return [...missingRelations, ...missingColumns].toSorted(compareDifferences);
}

export function formatDifference(difference: SchemaDifference): string {
  const { relation, relationKind, column, missingFrom: side } = difference;
  const section = SECTION_BY_KIND[relationKind];
  const isColumn = column !== null;
  const subject = isColumn
    ? `Column public.${relation}.${column}`
    : `${relationKind === "table" ? "Table" : "View"} public.${relation}`;

  let message: string;
  if (side === "database.ts") {
    const fix = isColumn
      ? `Add it to the ${relationKind === "table" ? "Row/Insert/Update types" : "Row type"}.`
      : `Add it under ${section}.`;
    message = `${subject} exists in the database but not in ${TYPES_PATH}. ${fix}`;
  } else {
    message =
      `${subject} exists in ${TYPES_PATH} (under ${section}) but not in the database. ` +
      "Remove it from the types, or add the migration that creates it.";
  }
  return `::error::${message}`;
}

function relationKey(relation: { name: string; kind: RelationKind }): string {
  return `${relation.kind}:${relation.name}`;
}

function missingFrom(
  relations: DbRelation[],
  otherSide: Map<string, DbRelation>,
  side: SchemaSide,
): SchemaDifference[] {
  return relations
    .filter((relation) => !otherSide.has(relationKey(relation)))
    .map((relation) => ({
      kind: "relation",
      relation: relation.name,
      relationKind: relation.kind,
      column: null,
      missingFrom: side,
    }));
}

function missingColumnsFrom(
  present: DbRelation,
  other: DbRelation,
  side: SchemaSide,
): SchemaDifference[] {
  const otherColumns = new Set(other.columns);
  return present.columns
    .filter((column) => !otherColumns.has(column))
    .map((column) => ({
      kind: "column",
      relation: present.name,
      relationKind: present.kind,
      column,
      missingFrom: side,
    }));
}

function compareDifferences(a: SchemaDifference, b: SchemaDifference): number {
  return (
    a.relation.localeCompare(b.relation) ||
    a.relationKind.localeCompare(b.relationKind) ||
    (a.column ?? "").localeCompare(b.column ?? "") ||
    a.missingFrom.localeCompare(b.missingFrom)
  );
}

// Reads `Database['public']['Tables' | 'Views'][name]['Row']` keys straight from the syntax tree.
function readTypeRelations(source: string): DbRelation[] {
  const file = ts.createSourceFile("database.ts", source, ts.ScriptTarget.Latest);
  const database = file.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "Database",
  );
  if (database === undefined) {
    throw new Error(`${TYPES_PATH} has no \`type Database\` declaration`);
  }

  const schema = requireMember(database.type, "public", "Database");
  return (["table", "view"] as const).flatMap((kind) => {
    const section = SECTION_BY_KIND[kind];
    const relations = requireMember(schema, section, `Database.public`);
    return literalMembers(relations, `Database.public.${section}`).map(
      (relation) => ({
        name: relation.name,
        kind,
        columns: literalMembers(
          requireMember(relation.type, "Row", `${section}.${relation.name}`),
          `${section}.${relation.name}.Row`,
        ).map((column) => column.name),
      }),
    );
  });
}

type NamedMember = { name: string; type: ts.TypeNode };

function literalMembers(node: ts.TypeNode, path: string): NamedMember[] {
  if (!ts.isTypeLiteralNode(node)) {
    throw new Error(`${TYPES_PATH}: ${path} is not an object type literal`);
  }
  return node.members.flatMap((member) => {
    if (!ts.isPropertySignature(member) || member.type === undefined) return [];
    const name = propertyName(member.name);
    return name === null ? [] : [{ name, type: member.type }];
  });
}

function requireMember(
  node: ts.TypeNode,
  name: string,
  path: string,
): ts.TypeNode {
  const member = literalMembers(node, path).find((m) => m.name === name);
  if (member === undefined) {
    throw new Error(`${TYPES_PATH}: ${path} has no \`${name}\` member`);
  }
  return member.type;
}

function propertyName(name: ts.PropertyName): string | null {
  const isNamed =
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name);
  return isNamed ? name.text : null;
}
