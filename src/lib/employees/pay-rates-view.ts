export type PayRateRow = {
  id: string;
  hourly_rate_cents: number;
  effective_from: string;
  is_archived: boolean;
  created_at: string;
};

// current: in effect today. scheduled: starts after today. past: superseded, still live.
export type PayRateKind = "current" | "scheduled" | "past";

export type LivePayRate = PayRateRow & { kind: PayRateKind };

export type PayRatesOverview = {
  live: LivePayRate[];
  archived: PayRateRow[];
  hasCurrent: boolean;
};

function byNewestFirst(left: PayRateRow, right: PayRateRow): number {
  return (
    right.effective_from.localeCompare(left.effective_from) ||
    right.created_at.localeCompare(left.created_at)
  );
}

// One Cleaner's rates, newest effective date first. `today` is the Business date (YYYY-MM-DD), so
// plain string comparison orders dates. The current rate follows the pay view's rule: the newest
// live row effective on or before the date.
export function payRatesOverview(
  rows: PayRateRow[],
  today: string,
): PayRatesOverview {
  const newestFirst = [...rows].sort(byNewestFirst);
  const liveRows = newestFirst.filter((row) => !row.is_archived);
  const currentId =
    liveRows.find((row) => row.effective_from <= today)?.id ?? null;

  const live = liveRows.map((row): LivePayRate => {
    let kind: PayRateKind = "past";
    if (row.id === currentId) {
      kind = "current";
    } else if (row.effective_from > today) {
      kind = "scheduled";
    }
    return { ...row, kind };
  });

  return {
    live,
    archived: newestFirst.filter((row) => row.is_archived),
    hasCurrent: currentId !== null,
  };
}
