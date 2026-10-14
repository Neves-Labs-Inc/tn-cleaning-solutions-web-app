"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import ListSearch from "@/components/admin/list-page/list-search";
import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import type { WeekRange } from "@/lib/time-sheets/range";

type TimeSheetsSearchProps = {
  range: WeekRange;
  q: string;
  showSearch: boolean;
  // The Suspense boundary that streams the summary; it stays mounted while the search changes.
  children: React.ReactNode;
};

export default function TimeSheetsSearch({
  range,
  q,
  showSearch,
  children,
}: TimeSheetsSearchProps): React.ReactNode {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Replace, so a debounced search doesn't stack history entries.
  function handleSearch(next: string): void {
    startTransition(() => {
      router.replace(
        buildTimeSheetsHref({ from: range.from, to: range.to, q: next }),
        { scroll: false },
      );
    });
  }

  return (
    <>
      {showSearch ? (
        <div className="md:max-w-sm">
          <ListSearch
            value={q}
            onChange={handleSearch}
            placeholder="Search Cleaners by name"
            ariaLabel="Search Cleaners"
          />
        </div>
      ) : null}
      <div
        className="group/search"
        data-pending={isPending || undefined}
        aria-busy={isPending || undefined}
      >
        {children}
      </div>
    </>
  );
}
