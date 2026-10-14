// Relative imports: node --test runs this file without the @/ alias.
import type { PayrollData } from "./payroll-data.ts";
import { listPayPeriods, type PayPeriod } from "./period.ts";
import { buildPeriodView, type PeriodStatus } from "./period-view.ts";

// The Pay periods list and the dashboard banner, from the overview of every period since the
// Payroll start. Pure.

export type PeriodRow = {
  period: PayPeriod;
  label: string;
  href: string;
  status: PeriodStatus;
  cleanerCount: number;
  totalCents: number;
  blockedCount: number;
  stragglerCount: number;
  // "4 Cleaners · 2 draft · 1 to pay"
  caption: string;
};

export type BannerLine = {
  // "Pay period Oct 5–18 ready to review · 2 blocked"
  text: string;
  // "Oct 5–18", for the Review button's accessible name.
  label: string;
  blockedCount: number;
  href: string;
};

export type PeriodsSummary = { rows: PeriodRow[]; bannerLines: BannerLine[] };

const NO_CLEANERS_CAPTION = "No Cleaners";

export function payrollPeriodHref(period: PayPeriod): string {
  return `/solutions/payroll/${period.start}`;
}

function formatCaption(
  cleanerCount: number,
  counts: { draft: number; finalized: number; paid: number },
): string {
  if (cleanerCount === 0) return NO_CLEANERS_CAPTION;

  return [
    `${cleanerCount} Cleaner${cleanerCount === 1 ? "" : "s"}`,
    counts.draft > 0 ? `${counts.draft} draft` : null,
    counts.finalized > 0 ? `${counts.finalized} to pay` : null,
    counts.paid > 0 ? `${counts.paid} paid` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

function toPeriodRow(
  data: PayrollData,
  period: PayPeriod,
  now: Date,
): PeriodRow {
  const view = buildPeriodView(data, period, now);
  const cleanerCount = new Set(view.runs.map((item) => item.cleaner.id)).size;
  return {
    period,
    label: view.label,
    href: payrollPeriodHref(period),
    status: view.status,
    cleanerCount,
    totalCents: view.totals.totalCents,
    blockedCount: view.counts.blocked,
    stragglerCount: view.counts.stragglers,
    caption: formatCaption(cleanerCount, view.counts),
  };
}

function toBannerLine(row: PeriodRow): BannerLine {
  const blocked = row.blockedCount > 0 ? ` · ${row.blockedCount} blocked` : "";
  return {
    text: `Pay period ${row.label} ready to review${blocked}`,
    label: row.label,
    blockedCount: row.blockedCount,
    href: row.href,
  };
}

export function summarizePeriods(
  overview: PayrollData,
  now: Date,
): PeriodsSummary {
  const rows = listPayPeriods(now).map((period) =>
    toPeriodRow(overview, period, now),
  );
  const bannerLines = rows
    .filter((row) => row.status.kind === "ready_to_review")
    .reverse()
    .map(toBannerLine);
  return { rows, bannerLines };
}
