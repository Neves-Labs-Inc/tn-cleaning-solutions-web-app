import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clientsInView,
  clientsQueryToSearchParams,
  isClientsFilterActive,
  owedByClient,
  parseClientsQuery,
  type ClientOverviewRow,
  type ClientsQuery,
  type OwedInvoice,
} from "../../src/lib/clients/overview.ts";

const DEFAULT: ClientsQuery = {
  query: "",
  status: "active",
  sort: "name",
  direction: "asc",
};

test("an empty query string parses to the defaults", () => {
  assert.deepEqual(parseClientsQuery({}), DEFAULT);
});

test("every param is read into the query", () => {
  const query = parseClientsQuery({
    q: " maple ",
    status: "archived",
    sort: "owed",
    dir: "asc",
  });

  assert.deepEqual(query, {
    query: "maple",
    status: "archived",
    sort: "owed",
    direction: "asc",
  });
});

test("a column alone takes its first direction", () => {
  assert.equal(parseClientsQuery({ sort: "owed" }).direction, "desc");
  assert.equal(parseClientsQuery({ sort: "locations" }).direction, "desc");
  assert.equal(parseClientsQuery({ sort: "name" }).direction, "asc");
});

test("unknown or repeated values fall back to the defaults", () => {
  const query = parseClientsQuery({
    q: ["a", "b"],
    status: "deleted",
    sort: ["owed", "name"],
    dir: "sideways",
  });

  assert.deepEqual(query, DEFAULT);
});

test("the defaults serialise to an empty query string", () => {
  assert.equal(clientsQueryToSearchParams(DEFAULT).toString(), "");
});

test("a non-default query serialises without its defaults", () => {
  const params = clientsQueryToSearchParams({
    query: "maple",
    status: "all",
    sort: "owed",
    direction: "desc",
  });

  assert.equal(params.toString(), "q=maple&status=all&sort=owed");
});

test("a query round-trips through the URL", () => {
  const queries: ClientsQuery[] = [
    DEFAULT,
    { query: "lee", status: "inactive", sort: "name", direction: "desc" },
    { query: "", status: "all", sort: "locations", direction: "asc" },
    { query: "416", status: "archived", sort: "owed", direction: "desc" },
  ];

  for (const query of queries) {
    const params = Object.fromEntries(clientsQueryToSearchParams(query));
    assert.deepEqual(parseClientsQuery(params), query);
  }
});

test("the filter is active when a search or a non-default status is set", () => {
  assert.equal(isClientsFilterActive(DEFAULT), false);
  assert.equal(isClientsFilterActive({ ...DEFAULT, query: "lee" }), true);
  assert.equal(isClientsFilterActive({ ...DEFAULT, status: "all" }), true);
});

test("sorting alone doesn't count as a filter", () => {
  const query: ClientsQuery = { ...DEFAULT, sort: "owed", direction: "asc" };
  assert.equal(isClientsFilterActive(query), false);
});

function invoice(
  clientId: string,
  totalCents: number,
  overrides: Partial<OwedInvoice> = {},
): OwedInvoice {
  return {
    client_id: clientId,
    total_cents: totalCents,
    status: "issued",
    is_archived: false,
    ...overrides,
  };
}

test("owedByClient sums each client's issued, unarchived invoices", () => {
  const owed = owedByClient([
    invoice("c1", 10_000),
    invoice("c2", 2_500),
    invoice("c1", 4_050),
  ]);

  assert.equal(owed.get("c1"), 14_050);
  assert.equal(owed.get("c2"), 2_500);
});

test("owedByClient keeps other clients' invoices out of a client's sum", () => {
  const owed = owedByClient([invoice("c1", 1_000), invoice("c2", 9_999)]);

  assert.equal(owed.get("c1"), 1_000);
  assert.equal(owed.get("c3"), undefined);
});

test("owedByClient ignores drafts, paid, void and archived invoices", () => {
  const owed = owedByClient([
    invoice("c1", 1_000),
    invoice("c1", 200, { status: "draft" }),
    invoice("c1", 300, { status: "paid" }),
    invoice("c1", 400, { status: "void" }),
    invoice("c1", 500, { is_archived: true }),
  ]);

  assert.equal(owed.get("c1"), 1_000);
});

function client(
  name: string,
  overrides: Partial<ClientOverviewRow> = {},
): ClientOverviewRow {
  return {
    id: name.toLowerCase(),
    name,
    email: null,
    phone: null,
    is_active: true,
    is_archived: false,
    location_count: 0,
    owed_cents: 0,
    ...overrides,
  };
}

const ACTIVE = client("Active Co");
const INACTIVE = client("Inactive Co", { is_active: false });
const ARCHIVED = client("Archived Co", { is_archived: true });
const ARCHIVED_INACTIVE = client("Old Co", {
  is_active: false,
  is_archived: true,
});
const EVERY_STATUS = [ACTIVE, INACTIVE, ARCHIVED, ARCHIVED_INACTIVE];

function namesInView(
  rows: ClientOverviewRow[],
  overrides: Partial<ClientsQuery>,
): string[] {
  return clientsInView(rows, { ...DEFAULT, ...overrides }).map(
    (row) => row.name,
  );
}

test("Active shows active, unarchived clients", () => {
  assert.deepEqual(namesInView(EVERY_STATUS, { status: "active" }), [
    "Active Co",
  ]);
});

test("Inactive shows inactive, unarchived clients", () => {
  assert.deepEqual(namesInView(EVERY_STATUS, { status: "inactive" }), [
    "Inactive Co",
  ]);
});

test("Archived shows every archived client, active or not", () => {
  assert.deepEqual(namesInView(EVERY_STATUS, { status: "archived" }), [
    "Archived Co",
    "Old Co",
  ]);
});

test("All shows every client", () => {
  assert.deepEqual(namesInView(EVERY_STATUS, { status: "all" }), [
    "Active Co",
    "Archived Co",
    "Inactive Co",
    "Old Co",
  ]);
});

const CONTACTS = [
  client("Maple Dental", { email: "office@mapledental.ca" }),
  client("Birch Law", { phone: "416 555 0101" }),
  client("Cedar Gym", { email: "FRONT@cedar.ca", phone: "647 555 0199" }),
];

test("search matches the name, case-insensitively", () => {
  assert.deepEqual(namesInView(CONTACTS, { query: "maple" }), [
    "Maple Dental",
  ]);
});

test("search matches the email", () => {
  assert.deepEqual(namesInView(CONTACTS, { query: "front@" }), [
    "Cedar Gym",
  ]);
});

test("search matches the phone", () => {
  assert.deepEqual(namesInView(CONTACTS, { query: "555 0101" }), [
    "Birch Law",
  ]);
});

test("search ignores surrounding spaces", () => {
  assert.deepEqual(namesInView(CONTACTS, { query: "  birch " }), [
    "Birch Law",
  ]);
});

const RANKED = [
  client("Cedar", { location_count: 1, owed_cents: 500 }),
  client("alder", { location_count: 3, owed_cents: 0 }),
  client("Birch", { location_count: 3, owed_cents: 500 }),
  client("Dogwood", { location_count: 0, owed_cents: null }),
];

test("Name sorts A to Z ignoring case, and flips to Z to A", () => {
  assert.deepEqual(namesInView(RANKED, { sort: "name", direction: "asc" }), [
    "alder",
    "Birch",
    "Cedar",
    "Dogwood",
  ]);
  assert.deepEqual(namesInView(RANKED, { sort: "name", direction: "desc" }), [
    "Dogwood",
    "Cedar",
    "Birch",
    "alder",
  ]);
});

test("Owed sorts high to low with ties by name, and a missing amount as $0", () => {
  assert.deepEqual(namesInView(RANKED, { sort: "owed", direction: "desc" }), [
    "Birch",
    "Cedar",
    "alder",
    "Dogwood",
  ]);
});

test("Owed low to high still breaks ties A to Z", () => {
  assert.deepEqual(namesInView(RANKED, { sort: "owed", direction: "asc" }), [
    "alder",
    "Dogwood",
    "Birch",
    "Cedar",
  ]);
});

test("Locations sorts high to low with ties by name", () => {
  assert.deepEqual(
    namesInView(RANKED, { sort: "locations", direction: "desc" }),
    ["alder", "Birch", "Cedar", "Dogwood"],
  );
});

test("Locations low to high still breaks ties A to Z", () => {
  assert.deepEqual(
    namesInView(RANKED, { sort: "locations", direction: "asc" }),
    ["Dogwood", "Cedar", "alder", "Birch"],
  );
});

test("clientsInView leaves the caller's rows untouched", () => {
  const rows = [client("B"), client("A")];
  clientsInView(rows, DEFAULT);
  assert.deepEqual(
    rows.map((row) => row.name),
    ["B", "A"],
  );
});
