// The clients overview's URL query, status rules, search, sort and Owed.
// Relative imports only, so `node --test` can load it.

import {
  compareText,
  enumParam,
  matchesSearch,
  parseSort,
  singleParam,
  sortRows,
  sortToParams,
  toSearchParams,
  type SearchParamValue,
  type SortColumns,
  type SortDirection,
} from "../admin/list-query.ts";

export type ClientStatusFilter = "active" | "inactive" | "archived" | "all";
export type ClientSortKey = "name" | "owed" | "locations";

export type ClientsQuery = {
  query: string;
  status: ClientStatusFilter;
  sort: ClientSortKey;
  direction: SortDirection;
};

const STATUSES: readonly ClientStatusFilter[] = [
  "active",
  "inactive",
  "archived",
  "all",
];
const DEFAULT_STATUS: ClientStatusFilter = "active";
const DEFAULT_SORT: ClientSortKey = "name";

export type ClientOverviewRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_archived: boolean;
  location_count: number;
  // null when the balances didn't load.
  owed_cents: number | null;
};

export type OwedInvoice = {
  client_id: string;
  total_cents: number;
  status: string;
  is_archived: boolean;
};

export const CLIENT_SORT_COLUMNS: SortColumns<ClientSortKey> = {
  name: { firstDirection: "asc" },
  owed: { firstDirection: "desc" },
  locations: { firstDirection: "desc" },
};

export function parseClientsQuery(
  params: Record<string, SearchParamValue>,
): ClientsQuery {
  const { sort, direction } = parseSort(
    params,
    CLIENT_SORT_COLUMNS,
    DEFAULT_SORT,
  );
  return {
    query: (singleParam(params.q) ?? "").trim(),
    status: enumParam(params.status, STATUSES, DEFAULT_STATUS),
    sort,
    direction,
  };
}

// Defaults are omitted so the default view keeps a clean URL.
export function clientsQueryToSearchParams(
  query: ClientsQuery,
): URLSearchParams {
  return toSearchParams(
    {
      q: query.query,
      status: query.status,
      ...sortToParams(query, CLIENT_SORT_COLUMNS, DEFAULT_SORT),
    },
    { status: DEFAULT_STATUS },
  );
}

// Sorting is a view choice, not a filter: only search and status hide rows.
export function isClientsFilterActive(query: ClientsQuery): boolean {
  return query.query !== "" || query.status !== DEFAULT_STATUS;
}

// The same set as Outstanding: issued, unarchived invoices.
function isOwed(invoice: OwedInvoice): boolean {
  return invoice.status === "issued" && !invoice.is_archived;
}

export function owedByClient(invoices: OwedInvoice[]): Map<string, number> {
  return invoices.filter(isOwed).reduce((owed, invoice) => {
    const sum = (owed.get(invoice.client_id) ?? 0) + invoice.total_cents;
    return owed.set(invoice.client_id, sum);
  }, new Map<string, number>());
}

function matchesStatus(
  row: ClientOverviewRow,
  status: ClientStatusFilter,
): boolean {
  const statusMatches: Record<ClientStatusFilter, boolean> = {
    active: row.is_active && !row.is_archived,
    inactive: !row.is_active && !row.is_archived,
    archived: row.is_archived,
    all: true,
  };
  return statusMatches[status];
}

function compareNames(a: ClientOverviewRow, b: ClientOverviewRow): number {
  return compareText(a.name, b.name);
}

const COMPARATORS: Record<
  ClientSortKey,
  (a: ClientOverviewRow, b: ClientOverviewRow) => number
> = {
  name: compareNames,
  // An unavailable balance ranks as $0.
  owed: (a, b) => (a.owed_cents ?? 0) - (b.owed_cents ?? 0),
  locations: (a, b) => a.location_count - b.location_count,
};

export function clientsInView(
  rows: ClientOverviewRow[],
  query: ClientsQuery,
): ClientOverviewRow[] {
  const visible = rows.filter(
    (row) =>
      matchesStatus(row, query.status) &&
      matchesSearch(query.query, [row.name, row.email, row.phone]),
  );
  return sortRows(visible, query, COMPARATORS, compareNames);
}
