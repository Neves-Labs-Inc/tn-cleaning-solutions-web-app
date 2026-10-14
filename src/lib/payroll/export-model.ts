// Relative imports: node --test runs this file without the @/ alias.
import type { Tables } from "../../types/database.ts";
import type { PayrollData } from "./payroll-data.ts";
import { addDays, type PayPeriod } from "./period.ts";
import { buildPeriodView, type PeriodRun } from "./period-view.ts";

// What a Pay period's Payroll export holds (the .xlsx and the PDF summary), built from the
// period's data. Pure. Only finalized and paid runs count, regular and off-cycle alike, so a
// re-download changes once a straggler's off-cycle run is finalized. Lines come from the period
// view: frozen claims for a paid run, live ones for a finalized run.

export type PayRateRow = Pick<
  Tables<"pay_rates">,
  "employee_id" | "hourly_rate_cents" | "effective_from" | "is_archived"
>;

export type ExportLine = {
  date: string;
  clientName: string | null;
  jobName: string | null;
  minutes: number;
  // null on a claimed shift whose Pay rate was removed after finalizing.
  rateCents: number | null;
  amountCents: number | null;
};

export type ExportAdjustment = {
  reason: string;
  // The date of the appointment it points at, or null for one about the whole run.
  linkedDate: string | null;
  amountCents: number;
};

export type ExportTotals = {
  minutes: number;
  shiftPayCents: number;
  adjustmentsCents: number;
  totalCents: number;
};

// One Cleaner's tab: her finalized and paid runs merged.
export type ExportCleaner = ExportTotals & {
  cleanerId: string;
  name: string;
  lines: ExportLine[];
  adjustments: ExportAdjustment[];
};

export type ExportSummaryLine = ExportTotals & {
  cleanerId: string;
  name: string;
  // Distinct values across her paid runs; empty while none is paid.
  payoutMethods: string[];
  paidDates: string[];
};

export type PayrollExportModel = {
  period: PayPeriod;
  summary: { lines: ExportSummaryLine[]; total: ExportTotals };
  cleaners: ExportCleaner[];
  // Base Pay rate in effect on the period's end date, no Job pay premium; null when none is.
  currentRates: Record<string, number | null>;
};

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function distinctSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value) => value !== null))].sort();
}

function getLinkedDates(data: PayrollData): Map<string, string> {
  const live = data.sessions.map(
    (row) => [row.appointment_employee_id, row.scheduled_date] as const,
  );
  // Frozen claims win: a paid session can leave the pay view.
  const frozen = data.runLines.flatMap((line) =>
    line.scheduled_date === null
      ? []
      : [[line.appointment_employee_id, line.scheduled_date] as const],
  );
  return new Map([...live, ...frozen]);
}

function toLines(run: PeriodRun): ExportLine[] {
  const priced = run.lines.map((line) => ({
    date: line.date,
    clientName: line.clientName,
    jobName: line.jobName,
    minutes: line.minutes,
    rateCents: line.rateCents,
    amountCents: line.amountCents,
  }));
  const unpriced = run.noRateLines.map((line) => ({
    date: line.date,
    clientName: line.clientName,
    jobName: line.jobName,
    minutes: line.minutes,
    rateCents: null,
    amountCents: null,
  }));
  return [...priced, ...unpriced];
}

function buildCleaner(
  runs: PeriodRun[],
  linkedDates: Map<string, string>,
): ExportCleaner {
  const lines = runs
    .flatMap(toLines)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.clientName ?? "").localeCompare(b.clientName ?? ""),
    );
  const adjustments = runs.flatMap((run) =>
    run.adjustments.map((item) => ({
      reason: item.reason,
      linkedDate:
        item.appointmentEmployeeId === null
          ? null
          : (linkedDates.get(item.appointmentEmployeeId) ?? null),
      amountCents: item.amountCents,
    })),
  );
  const shiftPayCents = sum(lines.map((line) => line.amountCents ?? 0));
  const adjustmentsCents = sum(adjustments.map((item) => item.amountCents));
  return {
    cleanerId: runs[0].cleaner.id,
    name: runs[0].cleaner.name,
    lines,
    adjustments,
    minutes: sum(lines.map((line) => line.minutes)),
    shiftPayCents,
    adjustmentsCents,
    totalCents: shiftPayCents + adjustmentsCents,
  };
}

function toSummaryLine(
  cleaner: ExportCleaner,
  runs: PeriodRun[],
): ExportSummaryLine {
  const paidRuns = runs.filter((run) => run.status === "paid");
  return {
    cleanerId: cleaner.cleanerId,
    name: cleaner.name,
    minutes: cleaner.minutes,
    shiftPayCents: cleaner.shiftPayCents,
    adjustmentsCents: cleaner.adjustmentsCents,
    totalCents: cleaner.totalCents,
    payoutMethods: distinctSorted(paidRuns.map((run) => run.payoutMethod)),
    paidDates: distinctSorted(paidRuns.map((run) => run.paidOn)),
  };
}

function getCurrentRate(
  employeeId: string,
  payRates: PayRateRow[],
  periodEnd: string,
): number | null {
  const inEffect = payRates
    .filter(
      (rate) =>
        rate.employee_id === employeeId &&
        !rate.is_archived &&
        rate.effective_from <= periodEnd,
    )
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return inEffect[0]?.hourly_rate_cents ?? null;
}

export function buildPayrollExportModel(
  data: PayrollData,
  period: PayPeriod,
  payRates: PayRateRow[],
): PayrollExportModel {
  // The view's clock only drives the period status, which the export never reads.
  const afterPeriod = new Date(`${addDays(period.end, 1)}T12:00:00Z`);
  const view = buildPeriodView(data, period, afterPeriod);
  const exported = view.runs.filter((run) => run.status !== "draft");
  const cleanerIds = [...new Set(exported.map((run) => run.cleaner.id))];
  const linkedDates = getLinkedDates(data);

  const runsByCleaner = cleanerIds.map((id) =>
    exported.filter((run) => run.cleaner.id === id),
  );
  const cleaners = runsByCleaner
    .map((runs) => buildCleaner(runs, linkedDates))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.cleanerId.localeCompare(b.cleanerId),
    );
  const lines = cleaners.map((cleaner) =>
    toSummaryLine(
      cleaner,
      exported.filter((run) => run.cleaner.id === cleaner.cleanerId),
    ),
  );

  return {
    period,
    summary: {
      lines,
      total: {
        minutes: sum(lines.map((line) => line.minutes)),
        shiftPayCents: sum(lines.map((line) => line.shiftPayCents)),
        adjustmentsCents: sum(lines.map((line) => line.adjustmentsCents)),
        totalCents: sum(lines.map((line) => line.totalCents)),
      },
    },
    cleaners,
    currentRates: Object.fromEntries(
      cleaners.map((cleaner) => [
        cleaner.cleanerId,
        getCurrentRate(cleaner.cleanerId, payRates, period.end),
      ]),
    ),
  };
}
