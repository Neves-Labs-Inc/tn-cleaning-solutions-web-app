// Relative imports: node --test runs this file without the @/ alias.
import type { PeriodRun, RunAdjustment } from "./period-view.ts";

// One run's ledger rows for the period page: priced and no-rate shifts in one dated list, each
// with the Adjustments that point at it. Pure.

export type LedgerEntry = {
  appointmentEmployeeId: string;
  date: string;
  clientName: string | null;
  jobName: string | null;
  minutes: number;
  // null on a shift with no Pay rate in effect.
  rateCents: number | null;
  amountCents: number | null;
  // Where to add the missing Pay rate; null on a priced shift.
  payRateHref: string | null;
  isEdited: boolean;
  isOddDuration: boolean;
  adjustments: RunAdjustment[];
};

export type Ledger = {
  entries: LedgerEntry[];
  // About the whole run, or pointing at a session that isn't one of its lines.
  runAdjustments: RunAdjustment[];
};

type EntryBase = Omit<LedgerEntry, "adjustments">;

export function buildLedger(run: PeriodRun): Ledger {
  const priced: EntryBase[] = run.lines.map((line) => ({
    ...line,
    payRateHref: null,
  }));
  const unpriced: EntryBase[] = run.noRateLines.map(({ href, ...line }) => ({
    ...line,
    rateCents: null,
    amountCents: null,
    payRateHref: href,
  }));
  const bases = [...priced, ...unpriced].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.clientName ?? "").localeCompare(b.clientName ?? ""),
  );
  const lineIds = new Set(bases.map((base) => base.appointmentEmployeeId));

  return {
    entries: bases.map((base) => ({
      ...base,
      adjustments: run.adjustments.filter(
        (item) => item.appointmentEmployeeId === base.appointmentEmployeeId,
      ),
    })),
    runAdjustments: run.adjustments.filter(
      (item) =>
        item.appointmentEmployeeId === null ||
        !lineIds.has(item.appointmentEmployeeId),
    ),
  };
}
