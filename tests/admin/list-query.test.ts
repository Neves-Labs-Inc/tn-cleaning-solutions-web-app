import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareText,
  enumParam,
  matchesSearch,
  nextSort,
  parseSort,
  singleParam,
  sortRows,
  sortToParams,
  toSearchParams,
  type SortColumns,
} from "../../src/lib/admin/list-query.ts";

type Column = "name" | "owed";

const COLUMNS: SortColumns<Column> = {
  name: { firstDirection: "asc" },
  owed: { firstDirection: "desc" },
};

const STATUSES = ["active", "inactive", "all"] as const;

test("singleParam reads one value and drops repeated or missing ones", () => {
  assert.equal(singleParam("lee"), "lee");
  assert.equal(singleParam(["lee", "kim"]), undefined);
  assert.equal(singleParam(undefined), undefined);
});

test("enumParam keeps an allowed value", () => {
  assert.equal(enumParam("inactive", STATUSES, "active"), "inactive");
});

test("enumParam falls back on an unknown, repeated or missing value", () => {
  assert.equal(enumParam("bogus", STATUSES, "active"), "active");
  assert.equal(enumParam(["all", "inactive"], STATUSES, "active"), "active");
  assert.equal(enumParam(undefined, STATUSES, "active"), "active");
});

test("parseSort reads a known column and direction", () => {
  assert.deepEqual(parseSort({ sort: "owed", dir: "asc" }, COLUMNS, "name"), {
    sort: "owed",
    direction: "asc",
  });
});

test("parseSort falls back to the default column on an unknown sort", () => {
  assert.deepEqual(parseSort({ sort: "bogus" }, COLUMNS, "name"), {
    sort: "name",
    direction: "asc",
  });
});

test("parseSort uses the column's first direction on a bad or missing dir", () => {
  assert.deepEqual(parseSort({ sort: "owed", dir: "up" }, COLUMNS, "name"), {
    sort: "owed",
    direction: "desc",
  });
  assert.deepEqual(parseSort({ sort: "owed" }, COLUMNS, "name"), {
    sort: "owed",
    direction: "desc",
  });
});

test("sortToParams omits the default column and its first direction", () => {
  const params = sortToParams(
    { sort: "name", direction: "asc" },
    COLUMNS,
    "name",
  );

  assert.deepEqual(params, {});
});

test("sortToParams keeps a non-default column and flipped direction", () => {
  assert.deepEqual(
    sortToParams({ sort: "owed", direction: "desc" }, COLUMNS, "name"),
    { sort: "owed" },
  );
  assert.deepEqual(
    sortToParams({ sort: "name", direction: "desc" }, COLUMNS, "name"),
    { dir: "desc" },
  );
  assert.deepEqual(
    sortToParams({ sort: "owed", direction: "asc" }, COLUMNS, "name"),
    { sort: "owed", dir: "asc" },
  );
});

test("sortToParams round-trips through parseSort", () => {
  const states = [
    { sort: "name", direction: "asc" },
    { sort: "name", direction: "desc" },
    { sort: "owed", direction: "asc" },
    { sort: "owed", direction: "desc" },
  ] as const;

  for (const state of states) {
    const params = sortToParams(state, COLUMNS, "name");
    assert.deepEqual(parseSort(params, COLUMNS, "name"), state);
  }
});

test("nextSort starts a newly chosen column at its first direction", () => {
  assert.deepEqual(
    nextSort({ sort: "name", direction: "asc" }, "owed", COLUMNS),
    { sort: "owed", direction: "desc" },
  );
});

test("nextSort flips the direction of the active column", () => {
  assert.deepEqual(
    nextSort({ sort: "owed", direction: "desc" }, "owed", COLUMNS),
    { sort: "owed", direction: "asc" },
  );
  assert.deepEqual(
    nextSort({ sort: "owed", direction: "asc" }, "owed", COLUMNS),
    { sort: "owed", direction: "desc" },
  );
});

test("matchesSearch matches a trimmed, case-insensitive substring", () => {
  assert.equal(matchesSearch("  LEE ", ["Ann Lee", "ann@example.com"]), true);
  assert.equal(matchesSearch("example.COM", ["Ann", "ann@example.com"]), true);
  assert.equal(matchesSearch("kim", ["Ann Lee", "ann@example.com"]), false);
});

test("matchesSearch skips null and undefined fields", () => {
  assert.equal(matchesSearch("416", [null, undefined, "416-555-0100"]), true);
  assert.equal(matchesSearch("null", [null, undefined]), false);
});

test("matchesSearch with an empty or blank query matches everything", () => {
  assert.equal(matchesSearch("", [null]), true);
  assert.equal(matchesSearch("   ", ["Ann"]), true);
});

test("compareText ignores case and accents", () => {
  assert.equal(compareText("ann", "ANN"), 0);
  assert.equal(compareText("Élan", "elan"), 0);
  assert.ok(compareText("ann", "bob") < 0);
});

type Row = { name: string; owed: number };

const COMPARATORS = {
  name: (a: Row, b: Row) => compareText(a.name, b.name),
  owed: (a: Row, b: Row) => a.owed - b.owed,
};

const byName = (a: Row, b: Row) => compareText(a.name, b.name);

test("sortRows applies the column comparator in the chosen direction", () => {
  const rows: Row[] = [
    { name: "Bob", owed: 200 },
    { name: "Ann", owed: 500 },
    { name: "Cy", owed: 100 },
  ];

  const ascending = sortRows(
    rows,
    { sort: "owed", direction: "asc" },
    COMPARATORS,
    byName,
  );
  const descending = sortRows(
    rows,
    { sort: "owed", direction: "desc" },
    COMPARATORS,
    byName,
  );

  assert.deepEqual(
    ascending.map((row) => row.name),
    ["Cy", "Bob", "Ann"],
  );
  assert.deepEqual(
    descending.map((row) => row.name),
    ["Ann", "Bob", "Cy"],
  );
});

test("sortRows breaks ties ascending whatever the direction", () => {
  const rows: Row[] = [
    { name: "Cy", owed: 0 },
    { name: "Ann", owed: 0 },
    { name: "Bob", owed: 900 },
  ];

  const sorted = sortRows(
    rows,
    { sort: "owed", direction: "desc" },
    COMPARATORS,
    byName,
  );

  assert.deepEqual(
    sorted.map((row) => row.name),
    ["Bob", "Ann", "Cy"],
  );
});

test("sortRows keeps input order for full ties and leaves the input alone", () => {
  const rows: Row[] = [
    { name: "Ann", owed: 0 },
    { name: "ann", owed: 0 },
    { name: "ANN", owed: 0 },
  ];
  const before = [...rows];

  const sorted = sortRows(
    rows,
    { sort: "owed", direction: "desc" },
    COMPARATORS,
    byName,
  );

  assert.deepEqual(sorted, before);
  assert.notEqual(sorted, rows);
  assert.deepEqual(rows, before);
});

test("toSearchParams drops empty values and values equal to their default", () => {
  const params = toSearchParams(
    { q: "", status: "active", sort: "owed", dir: "desc" },
    { q: "", status: "active", dir: "asc" },
  );

  assert.equal(params.toString(), "sort=owed&dir=desc");
});

test("toSearchParams of all defaults is empty", () => {
  const params = toSearchParams({ status: "active" }, { status: "active" });

  assert.equal(params.toString(), "");
});
