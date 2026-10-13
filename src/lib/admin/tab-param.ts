// The `?tab=` param shared by admin detail pages. Pure, with relative imports only, so node --test can load it.

const TAB_PARAM = "tab";

export function parseTabParam<T extends string>(
  value: string | string[] | undefined,
  tabs: readonly T[],
  fallback: T,
): T {
  // A repeated param is ambiguous, so it reads as missing.
  if (typeof value !== "string") return fallback;

  return tabs.find((tab) => tab === value) ?? fallback;
}

// The query string ('' or '?…') for `tab`. The default tab is left out of the URL; every other param is kept.
export function tabSearch<T extends string>(
  current: URLSearchParams,
  tab: T,
  fallback: T,
): string {
  const next = new URLSearchParams(current);
  if (tab === fallback) {
    next.delete(TAB_PARAM);
  } else {
    next.set(TAB_PARAM, tab);
  }
  const search = next.toString();
  return search ? `?${search}` : "";
}
