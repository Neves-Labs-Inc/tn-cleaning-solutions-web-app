import AdjustmentRow from "@/components/admin/payroll/adjustment-row";
import LedgerEntryCard from "@/components/admin/payroll/ledger-entry-card";
import LedgerTable from "@/components/admin/payroll/ledger-table";
import ProblemSessionBlock from "@/components/admin/payroll/problem-session-block";
import RunStateLine from "@/components/admin/payroll/run-state-line";
import { formatSignedCents, getRunStateLine } from "@/lib/payroll/format";
import { buildLedger } from "@/lib/payroll/ledger";
import { formatHoursMinutes } from "@/lib/payroll/period";
import type { PeriodRun, PeriodStatus } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";

type PayRunLedgerProps = {
  run: PeriodRun;
  periodStatus: PeriodStatus;
};

const EYEBROW_CLASS_NAME =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

function RunTotals({ run }: { run: PeriodRun }): React.ReactNode {
  const totals = [
    { label: "Clocked", value: formatHoursMinutes(run.minutes) },
    { label: "Shift pay", value: formatCents(run.shiftPayCents) },
    { label: "Adjustments", value: formatSignedCents(run.adjustmentsCents) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/60 px-4 py-3 text-sm @md:grid-cols-4">
      {totals.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-mono tabular-nums">{item.value}</dd>
        </div>
      ))}
      <div>
        <dt className="text-xs text-muted-foreground">Total</dt>
        <dd className="font-mono text-base font-semibold tabular-nums">
          {formatCents(run.totalCents)}
        </dd>
      </div>
    </dl>
  );
}

// One Cleaner's run: problem sessions, pay lines with their Adjustments, the run's own
// Adjustments, totals and the action area. Lays itself out by its own width, not the viewport.
export default function PayRunLedger({
  run,
  periodStatus,
}: PayRunLedgerProps): React.ReactNode {
  const { entries, runAdjustments } = buildLedger(run);
  const isPaid = run.status === "paid";
  const hasNoLines = entries.length === 0;

  return (
    <div className="@container space-y-3">
      {run.problemSessions.length > 0 ? (
        <div className="space-y-2">
          {run.problemSessions.map((problem) => (
            <ProblemSessionBlock
              key={problem.appointmentEmployeeId}
              problem={problem}
              runStatus={run.status}
            />
          ))}
        </div>
      ) : null}

      {hasNoLines && run.problemSessions.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          No closed shifts. This run shows at {formatCents(0)} so the flagged
          appointment isn&apos;t missed.
        </p>
      ) : null}

      {hasNoLines ? null : (
        <>
          <div className="space-y-3 @xl:hidden">
            {entries.map((entry) => (
              <LedgerEntryCard
                key={entry.appointmentEmployeeId}
                entry={entry}
                cleanerId={run.cleaner.id}
                isPaid={isPaid}
              />
            ))}
          </div>
          <div className="hidden @xl:block">
            <LedgerTable
              entries={entries}
              cleanerName={run.cleaner.name}
              cleanerId={run.cleaner.id}
              isPaid={isPaid}
            />
          </div>
        </>
      )}

      {runAdjustments.length > 0 ? (
        <section className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">
          <h3 className={EYEBROW_CLASS_NAME}>Adjustments for the run</h3>
          <div className="divide-y">
            {runAdjustments.map((item) => (
              <AdjustmentRow key={item.id} adjustment={item} showsAppointment />
            ))}
          </div>
        </section>
      ) : null}

      <RunTotals run={run} />

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
        <RunStateLine line={getRunStateLine(run, periodStatus)} />
      </div>
    </div>
  );
}
