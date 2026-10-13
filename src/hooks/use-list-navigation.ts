import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

export type ListNavigation<Q> = {
  // The query being navigated to, ahead of the server render.
  query: Q;
  isNavigating: boolean;
  push: (next: Q) => void;
  replace: (next: Q) => void;
};

// The URL is the source of truth for an admin list's query. Controls show the
// optimistic query at once while the page re-renders on the server.
export function useListNavigation<Q>(
  query: Q,
  toParams: (q: Q) => URLSearchParams,
): ListNavigation<Q> {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startTransition] = useTransition();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(query);

  function hrefFor(next: Q): string {
    const search = toParams(next).toString();
    return search ? `${pathname}?${search}` : pathname;
  }

  function navigate(next: Q, method: "push" | "replace"): void {
    startTransition(() => {
      setOptimisticQuery(next);
      router[method](hrefFor(next), { scroll: false });
    });
  }

  return {
    query: optimisticQuery,
    isNavigating,
    push: (next) => navigate(next, "push"),
    replace: (next) => navigate(next, "replace"),
  };
}
