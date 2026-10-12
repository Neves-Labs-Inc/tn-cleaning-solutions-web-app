import { APPOINTMENTS_PATH } from "./overview.ts";

type ListStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "appointments-list-href";

// Only the list itself (with or without a query), never a nested route like /new or /:id.
function isListHref(href: string): boolean {
  return href === APPOINTMENTS_PATH || href.startsWith(`${APPOINTMENTS_PATH}?`);
}

// Reading window.sessionStorage itself throws SecurityError when site data is blocked, so it sits behind a try.
export function browserListStorage(): ListStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Storage can be missing or throw (private modes, blocked site data); a failed save only loses the shortcut.
export function rememberListHref(storage: ListStorage | null, href: string): void {
  try {
    storage?.setItem(STORAGE_KEY, href);
  } catch {
    // Expected in private modes; links fall back to the bare list.
  }
}

export function listReturnHref(storage: ListStorage | null): string {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Expected in private modes; treated as nothing saved.
  }
  return saved !== null && isListHref(saved) ? saved : APPOINTMENTS_PATH;
}
