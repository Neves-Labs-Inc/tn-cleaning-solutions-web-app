// Relative imports: node --test runs this file without the @/ alias.
import type {
  PayAdjustmentRow,
  PayCleaner,
  PayrollData,
  PayRunLineRow,
  PayRunRow,
  PaySessionRow,
} from "./payroll-data.ts";
import {
  finalizeOpensOn,
  formatPeriodLabel,
  formatShortDate,
  isPeriodEnded,
  type PayPeriod,
} from "./period.ts";

// Shapes one Pay period's pay view rows, runs, claims and Adjustments into what the Payroll
// screens show. Pure. Run membership follows the spec (.scratch/payroll-v2/spec.md, "Run
// membership") and must agree with the Payroll SQL functions:
//
//   * The current draft is the regular run while it isn't finalized; after that it's the started
//     off-cycle draft, if any. Its lines are the Cleaner's unclaimed closed payable sessions.
//   * A finalized run's lines are its claims, still live from the pay view. A paid run's lines
//     are its frozen claims (pay_run_lines), never the view: a paid session can leave the view.
//   * Blockers: an Open shift or Missing clock on a payable session, or a shift with no Pay rate.
//     Odd duration only warns. Cancelled appointments (not payable) never pay or block.
//   * Stragglers: unclaimed closed shifts once the regular run is finalized or paid, plus
//     unclaimed Open shifts / Missing clocks then, linked to Time Sheets (Franklin, review of
//     ticket 06). Only one unpaid off-cycle run may exist (start_off_cycle_run refuses
//     draft_exists), so a finalized unpaid one blocks starting another.

export type RunKind = PayRunRow["kind"];
export type RunStatus = PayRunRow["status"];
export type ProblemKind = "open_shift" | "missing_clock";

export type RunCleaner = { id: string; name: string; isActive: boolean };

export type PayLine = {
  appointmentEmployeeId: string;
  date: string;
  clientName: string | null;
  jobName: string | null;
  minutes: number;
  rateCents: number;
  amountCents: number;
  isEdited: boolean;
  isOddDuration: boolean;
};

// A closed shift with no Pay rate in effect: shown at $0 until the admin adds one.
export type NoRateLine = Omit<PayLine, "rateCents" | "amountCents"> & {
  href: string;
};

// An Open shift or Missing clock: shown at $0, fixed on Time Sheets.
export type ProblemSession = {
  appointmentEmployeeId: string;
  date: string;
  clientName: string | null;
  jobName: string | null;
  kind: ProblemKind;
  // For an Open shift's "Clocked in 9:00 AM, no clock-out".
  clockedInAt: string | null;
  href: string;
};

export type RunAdjustment = {
  id: string;
  amountCents: number;
  reason: string;
  // The session it points at, or null for one about the whole run.
  appointmentEmployeeId: string | null;
  // "Oct 8 · Patel residence" for the appointment it points at.
  appointmentLabel: string | null;
};

export type PeriodRun = {
  // Stable across renders, also for a draft with no stored row.
  key: string;
  // null for a draft computed live with no stored row yet.
  runId: string | null;
  cleaner: RunCleaner;
  kind: RunKind;
  status: RunStatus;
  lines: PayLine[];
  problemSessions: ProblemSession[];
  noRateLines: NoRateLine[];
  adjustments: RunAdjustment[];
  minutes: number;
  shiftPayCents: number;
  adjustmentsCents: number;
  totalCents: number;
  flagCount: number;
  blockedReason: string | null;
  payoutMethod: string | null;
  paidOn: string | null;
  defaultPayoutMethod: string | null;
  eTransferContact: string | null;
};

export type Straggler = {
  key: string;
  cleaner: RunCleaner;
  session: {
    appointmentEmployeeId: string;
    date: string;
    clientName: string | null;
    jobName: string | null;
    minutes: number;
    amountCents: number | null;
  };
  label: string;
  // An Open shift or Missing clock: not payable until fixed on Time Sheets (href).
  problem: ProblemKind | null;
  href: string | null;
  hasOffCycleDraft: boolean;
  // null when no off-cycle action applies: a problem shift, or a finalized off-cycle run
  // that must be paid or undone first (note says so).
  actionLabel: StragglerAction | null;
  note: string | null;
};

export type StragglerAction = "Start off-cycle run" | "Open off-cycle run";

export type PeriodStatusKind =
  | "running"
  | "ready_to_review"
  | "to_pay"
  | "paid"
  | "no_pay";

export type PeriodStatus = {
  kind: PeriodStatusKind;
  label: string;
  // While running: the Monday Finalize opens.
  finalizeOpensOn: string | null;
};

export type PeriodView = {
  period: PayPeriod;
  label: string;
  isEnded: boolean;
  status: PeriodStatus;
  runs: PeriodRun[];
  stragglers: Straggler[];
  totals: { minutes: number; totalCents: number };
  counts: {
    draft: number;
    finalized: number;
    paid: number;
    blocked: number;
    stragglers: number;
  };
};

export const PERIOD_STATUS_LABELS: Record<PeriodStatusKind, string> = {
  running: "Running",
  ready_to_review: "Ready to review",
  to_pay: "Finalized · to pay",
  paid: "Paid",
  no_pay: "No pay",
};

export type BlockerCounts = {
  openShifts: number;
  missingClocks: number;
  noRateLines: number;
};

const UNKNOWN_CLEANER_NAME = "Unknown Cleaner";
export const UNPAID_OFF_CYCLE_NOTE = "Pay or undo the off-cycle run first";
const NO_CLIENT_LABEL = "No client";

type PeriodContext = {
  edited: Set<string>;
  // Every session and frozen claim by session id, to label Adjustments.
  sessionsById: Map<string, PaySessionRow>;
  frozenById: Map<string, PayRunLineRow>;
  runLines: PayRunLineRow[];
  adjustments: PayAdjustmentRow[];
};

type RunParts = {
  lines: PayLine[];
  noRateLines: NoRateLine[];
  problemSessions: ProblemSession[];
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// "1 Open shift and 2 Missing clocks"; empty when neither.
export function describeClockProblems(counts: BlockerCounts): string {
  return [
    counts.openShifts > 0 ? pluralize(counts.openShifts, "Open shift") : null,
    counts.missingClocks > 0
      ? pluralize(counts.missingClocks, "Missing clock")
      : null,
  ]
    .filter((part) => part !== null)
    .join(" and ");
}

// "Fix 1 Open shift to finalize", "Add a Pay rate to finalize", or both combined.
export function describeBlockers(
  counts: BlockerCounts,
  action: "finalize" | "mark paid",
): string | null {
  const clockProblems = describeClockProblems(counts);
  const hasNoRate = counts.noRateLines > 0;

  let reason: string | null = null;
  if (clockProblems !== "" && hasNoRate) {
    reason = `Fix ${clockProblems} and add a Pay rate to ${action}`;
  } else if (clockProblems !== "") {
    reason = `Fix ${clockProblems} to ${action}`;
  } else if (hasNoRate) {
    reason = `Add a Pay rate to ${action}`;
  }
  return reason;
}

export function timeSheetHref(employeeId: string, date: string): string {
  const params = new URLSearchParams({
    cleaner: employeeId,
    from: date,
    to: date,
  });
  return `/solutions/time-tracking?${params.toString()}`;
}

export function payRateHref(employeeId: string): string {
  return `/solutions/employees/${encodeURIComponent(employeeId)}#pay`;
}

function formatAppointmentLabel(
  date: string,
  clientName: string | null,
): string {
  return `${formatShortDate(date)} · ${clientName ?? NO_CLIENT_LABEL}`;
}

function byDateThenStart(a: PaySessionRow, b: PaySessionRow): number {
  return (
    a.scheduled_date.localeCompare(b.scheduled_date) ||
    a.scheduled_start_time.localeCompare(b.scheduled_start_time) ||
    a.appointment_employee_id.localeCompare(b.appointment_employee_id)
  );
}

function isUnclaimedClosed(row: PaySessionRow): boolean {
  return row.pay_run_id === null && row.is_payable && row.state === "closed";
}

function getProblemKind(row: PaySessionRow): ProblemKind | null {
  if (!row.is_payable) return null;

  let kind: ProblemKind | null = null;
  if (row.is_open_shift) {
    kind = "open_shift";
  } else if (row.is_missing_clock) {
    kind = "missing_clock";
  }
  return kind;
}

// Splits live pay view rows into priced lines, no-rate lines and problem sessions.
function splitLiveRows(
  rows: PaySessionRow[],
  context: PeriodContext,
): RunParts {
  const sorted = rows.filter((row) => row.is_payable).sort(byDateThenStart);
  const closed = sorted.filter((row) => row.state === "closed");

  const lines = closed
    .filter((row) => !row.has_no_rate)
    .map((row) => ({
      appointmentEmployeeId: row.appointment_employee_id,
      date: row.scheduled_date,
      clientName: row.client_name,
      jobName: row.job_name,
      minutes: row.clocked_minutes ?? 0,
      rateCents: row.effective_rate_cents ?? 0,
      amountCents: row.amount_cents ?? 0,
      isEdited: context.edited.has(row.appointment_employee_id),
      isOddDuration: row.is_odd_duration,
    }));
  const noRateLines = closed
    .filter((row) => row.has_no_rate)
    .map((row) => ({
      appointmentEmployeeId: row.appointment_employee_id,
      date: row.scheduled_date,
      clientName: row.client_name,
      jobName: row.job_name,
      minutes: row.clocked_minutes ?? 0,
      isEdited: context.edited.has(row.appointment_employee_id),
      isOddDuration: row.is_odd_duration,
      href: payRateHref(row.employee_id),
    }));
  const problemSessions = sorted.flatMap((row) => {
    const kind = getProblemKind(row);
    return kind === null
      ? []
      : [
          {
            appointmentEmployeeId: row.appointment_employee_id,
            date: row.scheduled_date,
            clientName: row.client_name,
            jobName: row.job_name,
            kind,
            clockedInAt: row.clocked_in_at,
            href: timeSheetHref(row.employee_id, row.scheduled_date),
          },
        ];
  });
  return { lines, noRateLines, problemSessions };
}

// A paid run reads only its frozen claims.
function frozenParts(payRun: PayRunRow, context: PeriodContext): RunParts {
  const lines = context.runLines
    .filter((line) => line.pay_run_id === payRun.id)
    .map((line) => ({
      appointmentEmployeeId: line.appointment_employee_id,
      date: line.scheduled_date ?? "",
      clientName: line.client_name,
      jobName: line.job_name,
      minutes: line.minutes ?? 0,
      rateCents: line.rate_cents ?? 0,
      amountCents: line.amount_cents ?? 0,
      isEdited: context.edited.has(line.appointment_employee_id),
      isOddDuration:
        context.sessionsById.get(line.appointment_employee_id)
          ?.is_odd_duration ?? false,
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.clientName ?? "").localeCompare(b.clientName ?? ""),
    );
  return { lines, noRateLines: [], problemSessions: [] };
}

function buildAdjustments(
  runId: string | null,
  context: PeriodContext,
): RunAdjustment[] {
  if (runId === null) return [];

  return context.adjustments
    .filter((item) => item.pay_run_id === runId)
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .map((item) => {
      const sessionId = item.appointment_employee_id;
      const live =
        sessionId === null ? undefined : context.sessionsById.get(sessionId);
      const frozen =
        sessionId === null ? undefined : context.frozenById.get(sessionId);
      const date = frozen?.scheduled_date ?? live?.scheduled_date ?? null;
      const clientName = frozen?.client_name ?? live?.client_name ?? null;
      return {
        id: item.id,
        amountCents: item.amount_cents,
        reason: item.reason,
        appointmentEmployeeId: sessionId,
        appointmentLabel:
          date === null ? null : formatAppointmentLabel(date, clientName),
      };
    });
}

function toRunCleaner(
  employeeId: string,
  cleaner: PayCleaner | undefined,
): RunCleaner {
  return {
    id: employeeId,
    name: cleaner?.fullName ?? UNKNOWN_CLEANER_NAME,
    isActive: cleaner?.isActive ?? false,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// A row's identity across refreshes, for selection and expanded state. A Cleaner has one regular
// run per period, so its key holds from live draft to stored row to finalized. Off-cycle runs are
// always stored (start_off_cycle_run), and a Cleaner can have several, so theirs carry the id.
export function getRunKey(
  employeeId: string,
  kind: RunKind,
  runId: string | null,
): string {
  return kind === "regular"
    ? `${employeeId}:regular`
    : `${employeeId}:off_cycle:${runId ?? "draft"}`;
}

type RunInput = {
  employeeId: string;
  cleaner: PayCleaner | undefined;
  kind: RunKind;
  status: RunStatus;
  stored: PayRunRow | null;
  parts: RunParts;
};

function buildRun(input: RunInput, context: PeriodContext): PeriodRun {
  const { parts, stored, status } = input;
  const runId = stored?.id ?? null;
  const adjustments = buildAdjustments(runId, context);
  const shiftPayCents = sum(parts.lines.map((line) => line.amountCents));
  const adjustmentsCents = sum(adjustments.map((item) => item.amountCents));
  const counts: BlockerCounts = {
    openShifts: parts.problemSessions.filter(
      (item) => item.kind === "open_shift",
    ).length,
    missingClocks: parts.problemSessions.filter(
      (item) => item.kind === "missing_clock",
    ).length,
    noRateLines: parts.noRateLines.length,
  };
  const oddCount = [...parts.lines, ...parts.noRateLines].filter(
    (line) => line.isOddDuration,
  ).length;

  let blockedReason: string | null = null;
  if (status === "draft") {
    blockedReason = describeBlockers(counts, "finalize");
  } else if (status === "finalized") {
    blockedReason = describeBlockers(counts, "mark paid");
  }

  return {
    key: getRunKey(input.employeeId, input.kind, runId),
    runId,
    cleaner: toRunCleaner(input.employeeId, input.cleaner),
    kind: input.kind,
    status,
    lines: parts.lines,
    problemSessions: parts.problemSessions,
    noRateLines: parts.noRateLines,
    adjustments,
    minutes: sum(
      [...parts.lines, ...parts.noRateLines].map((line) => line.minutes),
    ),
    shiftPayCents,
    adjustmentsCents,
    totalCents: shiftPayCents + adjustmentsCents,
    flagCount: parts.problemSessions.length + oddCount,
    blockedReason,
    payoutMethod: stored?.payout_method ?? null,
    paidOn: stored?.paid_on ?? null,
    defaultPayoutMethod: input.cleaner?.defaultPayoutMethod ?? null,
    eTransferContact: input.cleaner?.eTransferContact ?? null,
  };
}

function getStragglerAction(
  offCycleRuns: PayRunRow[],
): Pick<Straggler, "hasOffCycleDraft" | "actionLabel" | "note"> {
  const unpaid = offCycleRuns.find((item) => item.status !== "paid") ?? null;

  let action: Pick<Straggler, "hasOffCycleDraft" | "actionLabel" | "note"> = {
    hasOffCycleDraft: false,
    actionLabel: "Start off-cycle run",
    note: null,
  };
  if (unpaid?.status === "draft") {
    action = {
      hasOffCycleDraft: true,
      actionLabel: "Open off-cycle run",
      note: null,
    };
  } else if (unpaid !== null) {
    action = {
      hasOffCycleDraft: false,
      actionLabel: null,
      note: UNPAID_OFF_CYCLE_NOTE,
    };
  }
  return action;
}

// Called only once the regular run is finalized or paid.
function buildStragglers(
  unclaimed: PaySessionRow[],
  cleaner: RunCleaner,
  offCycleRuns: PayRunRow[],
): Straggler[] {
  const action = getStragglerAction(offCycleRuns);
  return unclaimed
    .filter((row) => isUnclaimedClosed(row) || getProblemKind(row) !== null)
    .sort(byDateThenStart)
    .map((row) => {
      const problem = row.state === "closed" ? null : getProblemKind(row);
      return {
        key: `${cleaner.id}:${row.appointment_employee_id}`,
        cleaner,
        session: {
          appointmentEmployeeId: row.appointment_employee_id,
          date: row.scheduled_date,
          clientName: row.client_name,
          jobName: row.job_name,
          minutes: row.clocked_minutes ?? 0,
          amountCents: row.amount_cents,
        },
        label: formatAppointmentLabel(row.scheduled_date, row.client_name),
        problem,
        href:
          problem === null
            ? null
            : timeSheetHref(row.employee_id, row.scheduled_date),
        ...(problem === null
          ? action
          : { ...action, actionLabel: null, note: null }),
      };
    });
}

type CleanerInput = {
  employeeId: string;
  cleaner: PayCleaner | undefined;
  sessions: PaySessionRow[];
  storedRuns: PayRunRow[];
};

function buildCleanerRuns(
  input: CleanerInput,
  context: PeriodContext,
): { runs: PeriodRun[]; stragglers: Straggler[] } {
  const { employeeId, cleaner, sessions, storedRuns } = input;
  const regular = storedRuns.find((item) => item.kind === "regular") ?? null;
  const offCycleDraft =
    storedRuns.find(
      (item) => item.kind === "off_cycle" && item.status === "draft",
    ) ?? null;
  const isRegularDraft = regular === null || regular.status === "draft";
  const unclaimed = sessions.filter((row) => row.pay_run_id === null);
  const currentDraftParts = splitLiveRows(unclaimed, context);

  const claimedRuns = storedRuns
    .filter((item) => item.status !== "draft")
    .map((item) =>
      buildRun(
        {
          employeeId,
          cleaner,
          kind: item.kind,
          status: item.status,
          stored: item,
          parts:
            item.status === "paid"
              ? frozenParts(item, context)
              : splitLiveRows(
                  sessions.filter((row) => row.pay_run_id === item.id),
                  context,
                ),
        },
        context,
      ),
    );

  const hasDraftWork =
    currentDraftParts.lines.length > 0 ||
    currentDraftParts.noRateLines.length > 0 ||
    currentDraftParts.problemSessions.length > 0;
  const draftRow = isRegularDraft ? regular : offCycleDraft;
  const hasCurrentDraft = draftRow !== null || (isRegularDraft && hasDraftWork);
  const draftRuns = hasCurrentDraft
    ? [
        buildRun(
          {
            employeeId,
            cleaner,
            kind: isRegularDraft ? "regular" : "off_cycle",
            status: "draft",
            stored: draftRow,
            parts: currentDraftParts,
          },
          context,
        ),
      ]
    : [];

  const stragglers = isRegularDraft
    ? []
    : buildStragglers(
        unclaimed,
        toRunCleaner(employeeId, cleaner),
        storedRuns.filter((item) => item.kind === "off_cycle"),
      );

  return { runs: [...claimedRuns, ...draftRuns], stragglers };
}

const KIND_ORDER: Record<RunKind, number> = { regular: 0, off_cycle: 1 };
const STATUS_ORDER: Record<RunStatus, number> = {
  paid: 0,
  finalized: 1,
  draft: 2,
};

// Regular runs first, then off-cycle; by Cleaner name within each.
function compareRuns(a: PeriodRun, b: PeriodRun): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.cleaner.name.localeCompare(b.cleaner.name) ||
    a.cleaner.id.localeCompare(b.cleaner.id) ||
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  );
}

function getPeriodStatus(
  period: PayPeriod,
  runs: PeriodRun[],
  isEnded: boolean,
): PeriodStatus {
  let kind: PeriodStatusKind = "paid";
  if (!isEnded) {
    kind = "running";
  } else if (runs.length === 0) {
    kind = "no_pay";
  } else if (runs.some((item) => item.status === "draft")) {
    kind = "ready_to_review";
  } else if (runs.some((item) => item.status === "finalized")) {
    kind = "to_pay";
  }
  return {
    kind,
    label: PERIOD_STATUS_LABELS[kind],
    finalizeOpensOn: isEnded ? null : finalizeOpensOn(period),
  };
}

export function buildPeriodView(
  data: PayrollData,
  period: PayPeriod,
  now: Date,
): PeriodView {
  const sessions = data.sessions.filter(
    (row) => row.period_start === period.start,
  );
  const storedRuns = data.runs.filter(
    (item) => item.period_start === period.start,
  );
  const context: PeriodContext = {
    edited: new Set(data.editedSessionIds),
    sessionsById: new Map(
      data.sessions.map((row) => [row.appointment_employee_id, row]),
    ),
    frozenById: new Map(
      data.runLines
        .filter((line) => line.scheduled_date !== null)
        .map((line) => [line.appointment_employee_id, line]),
    ),
    runLines: data.runLines,
    adjustments: data.adjustments,
  };
  const cleanersById = new Map(data.cleaners.map((item) => [item.id, item]));
  const employeeIds = [
    ...new Set([
      ...sessions.map((row) => row.employee_id),
      ...storedRuns.map((item) => item.employee_id),
    ]),
  ];

  const perCleaner = employeeIds.map((employeeId) =>
    buildCleanerRuns(
      {
        employeeId,
        cleaner: cleanersById.get(employeeId),
        sessions: sessions.filter((row) => row.employee_id === employeeId),
        storedRuns: storedRuns.filter(
          (item) => item.employee_id === employeeId,
        ),
      },
      context,
    ),
  );
  const runs = perCleaner.flatMap((item) => item.runs).sort(compareRuns);
  const stragglers = perCleaner
    .flatMap((item) => item.stragglers)
    .sort(
      (a, b) =>
        a.cleaner.name.localeCompare(b.cleaner.name) ||
        a.session.date.localeCompare(b.session.date),
    );
  const isEnded = isPeriodEnded(period, now);

  return {
    period,
    label: formatPeriodLabel(period),
    isEnded,
    status: getPeriodStatus(period, runs, isEnded),
    runs,
    stragglers,
    totals: {
      minutes: sum(runs.map((item) => item.minutes)),
      totalCents: sum(runs.map((item) => item.totalCents)),
    },
    counts: {
      draft: runs.filter((item) => item.status === "draft").length,
      finalized: runs.filter((item) => item.status === "finalized").length,
      paid: runs.filter((item) => item.status === "paid").length,
      blocked: runs.filter((item) => item.blockedReason !== null).length,
      stragglers: stragglers.length,
    },
  };
}
