import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/types/database.ts";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type ReadError = { message: string; details: string | null; hint: string | null; code: string };
type ReadResult = { data: Row[] | null; error: ReadError | null };

export type ReadRequest = { table: string; range: [number, number] | null };

export type FakeSupabase = {
  db: SupabaseClient<Database>;
  requests: ReadRequest[];
};

// PostgREST's max-rows: a response never holds more, whatever range was asked for.
export const MAX_ROWS = 1000;

// Reads `a.b.c` so filters on an embedded resource (`appointment.status`) reach into the
// pre-joined row, the way PostgREST filters an !inner embed.
function readPath(row: Row, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, key) => (value as Row | null | undefined)?.[key], row);
}

function unstableOrderError(column: string | null): ReadError {
  return {
    message: `range() needs a stable order; ordered by ${column ?? "nothing"}`,
    details: null,
    hint: null,
    code: "TEST",
  };
}

// Hand-rolled stand-in for paginated reads, modelled on tests/invoices/fake-supabase.ts. Seed
// tables with rows already shaped like the select's result (embeds nested). Filters apply,
// `.order()` sorts, `.range()` slices, and every response is capped at MAX_ROWS. Paging without
// an order on a unique column answers with an error, because Postgres would return pages in an
// arbitrary order. `requests` logs each awaited read. `failingTables` answer with an error.
export function createFakeSupabase(
  tables: Record<string, Row[]>,
  failingTables: string[] = [],
): FakeSupabase {
  const requests: ReadRequest[] = [];

  function from(table: string) {
    const filters: Filter[] = [];
    let orderColumn: string | null = null;
    let isAscending = true;
    let range: [number, number] | null = null;

    function addFilter(filter: Filter) {
      filters.push(filter);
      return builder;
    }

    function read(): ReadResult {
      if (failingTables.includes(table)) {
        return {
          data: null,
          error: { message: "connection reset", details: null, hint: null, code: "08006" },
        };
      }

      const rows = tables[table] ?? [];
      const orderValues = orderColumn === null ? [] : rows.map((row) => readPath(row, orderColumn as string));
      if (range && (orderColumn === null || new Set(orderValues).size !== rows.length)) {
        return { data: null, error: unstableOrderError(orderColumn) };
      }

      const direction = isAscending ? 1 : -1;
      const sorted = rows
        .filter((row) => filters.every((filter) => filter(row)))
        .sort((a, b) =>
          orderColumn === null
            ? 0
            : String(readPath(a, orderColumn)).localeCompare(String(readPath(b, orderColumn))) * direction,
        );
      const [start, end] = range ?? [0, sorted.length - 1];
      return { data: sorted.slice(start, end + 1).slice(0, MAX_ROWS), error: null };
    }

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => addFilter((row) => readPath(row, column) === value),
      neq: (column: string, value: unknown) => addFilter((row) => readPath(row, column) !== value),
      in: (column: string, values: unknown[]) =>
        addFilter((row) => values.includes(readPath(row, column))),
      gte: (column: string, value: string) =>
        addFilter((row) => String(readPath(row, column)) >= value),
      lte: (column: string, value: string) =>
        addFilter((row) => String(readPath(row, column)) <= value),
      // Like SQL `IS`, NULL and undefined both match null.
      is: (column: string, value: boolean | null) =>
        addFilter((row) => (readPath(row, column) ?? null) === value),
      not: (column: string, _operator: "is", value: boolean | null) =>
        addFilter((row) => (readPath(row, column) ?? null) !== value),
      order: (column: string, options: { ascending?: boolean } = {}) => {
        orderColumn = column;
        isAscending = options.ascending ?? true;
        return builder;
      },
      range: (start: number, end: number) => {
        range = [start, end];
        return builder;
      },
      then: (resolve: (result: ReadResult) => unknown) => {
        requests.push({ table, range });
        return Promise.resolve(read()).then(resolve);
      },
    };

    return builder;
  }

  return { db: { from } as unknown as SupabaseClient<Database>, requests };
}
