// URL list state shared by admin overview lists: param parsing, sort state,
// search matching, sorting and serialising. Relative imports only, so
// `node --test` can load it.

export type SearchParamValue = string | string[] | undefined;
export type SortDirection = "asc" | "desc";
export type SortState<K extends string> = { sort: K; direction: SortDirection };
export type SortColumns<K extends string> = Record<
  K,
  { firstDirection: SortDirection }
>;

const SORT_KEY = "sort";
const DIRECTION_KEY = "dir";
const DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

// A repeated param is ambiguous, so it counts as missing.
export function singleParam(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function enumParam<T extends string>(
  value: SearchParamValue,
  allowed: readonly T[],
  fallback: T,
): T {
  const single = singleParam(value);
  const match = allowed.find((option) => option === single);
  return match ?? fallback;
}

function columnKeys<K extends string>(columns: SortColumns<K>): K[] {
  // Object.keys widens to string[]; the keys are exactly K by construction.
  return Object.keys(columns) as K[];
}

function flip(direction: SortDirection): SortDirection {
  return direction === "asc" ? "desc" : "asc";
}

export function parseSort<K extends string>(
  params: Record<string, SearchParamValue>,
  columns: SortColumns<K>,
  fallback: K,
): SortState<K> {
  const sort = enumParam(params[SORT_KEY], columnKeys(columns), fallback);
  const direction = enumParam(
    params[DIRECTION_KEY],
    DIRECTIONS,
    columns[sort].firstDirection,
  );
  return { sort, direction };
}

export function sortToParams<K extends string>(
  state: SortState<K>,
  columns: SortColumns<K>,
  fallback: K,
): Record<string, string> {
  const isDefaultColumn = state.sort === fallback;
  const isFirstDirection =
    state.direction === columns[state.sort].firstDirection;
  return {
    ...(isDefaultColumn ? {} : { [SORT_KEY]: state.sort }),
    ...(isFirstDirection ? {} : { [DIRECTION_KEY]: state.direction }),
  };
}

export function nextSort<K extends string>(
  current: SortState<K>,
  column: K,
  columns: SortColumns<K>,
): SortState<K> {
  const direction =
    column === current.sort
      ? flip(current.direction)
      : columns[column].firstDirection;
  return { sort: column, direction };
}

export function matchesSearch(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return fields.some((field) => field?.toLowerCase().includes(needle) ?? false);
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Array sort is stable, so full ties keep their input order. The copy keeps
// the caller's array untouched.
export function sortRows<T, K extends string>(
  rows: T[],
  state: SortState<K>,
  comparators: Record<K, (a: T, b: T) => number>,
  tiebreak: (a: T, b: T) => number,
): T[] {
  const compareColumn = comparators[state.sort];
  const sign = state.direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) => sign * compareColumn(a, b) || tiebreak(a, b),
  );
}

export function toSearchParams(
  values: Record<string, string>,
  defaults: Record<string, string>,
): URLSearchParams {
  const kept = Object.entries(values).filter(
    ([key, value]) => value !== "" && value !== defaults[key],
  );
  return new URLSearchParams(kept);
}
