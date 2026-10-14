import { formatCents, formatRate } from '@/lib/pricing/money'
import type { MyPaidRun } from '@/lib/payroll/my-pay'

const EYEBROW_CLASSES = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
const ROW_CLASSES = 'grid grid-cols-[1fr_auto] gap-x-3 py-2'

type PaidRunLinesProps = {
  run: MyPaidRun
}

// The inside of an expanded paid run: its shifts, its Adjustments, and the total. Rows are read-only.
export function PaidRunLines({ run }: PaidRunLinesProps): React.ReactNode {
  return (
    <div className="space-y-3">
      {run.lines.length > 0 ? (
        <section aria-label="Shifts">
          <h3 className={EYEBROW_CLASSES}>Shifts</h3>
          <ul>
            {run.lines.map((line) => (
              <li key={line.id} className={ROW_CLASSES}>
                <div className="min-w-0">
                  <p className="text-sm font-medium wrap-break-word text-foreground">{line.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {line.dateLabel} ·{' '}
                    <span className="font-mono tabular-nums">
                      {line.hoursLabel} × {formatRate(line.rateCents)}
                    </span>
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground tabular-nums">{formatCents(line.amountCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run.adjustments.length > 0 ? (
        <section aria-label="Adjustments">
          <h3 className={EYEBROW_CLASSES}>Adjustments</h3>
          <ul>
            {run.adjustments.map((adjustment) => (
              <li key={adjustment.id} className={ROW_CLASSES}>
                <div className="min-w-0">
                  <p className="text-sm font-medium wrap-break-word text-foreground">{adjustment.reason}</p>
                  {adjustment.linkedLabel ? (
                    <p className="text-sm text-muted-foreground">{adjustment.linkedLabel}</p>
                  ) : null}
                </div>
                <p className="text-sm font-medium text-foreground tabular-nums">{adjustment.amountLabel}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-1 flex justify-between border-t pt-3">
        <p className="text-sm font-semibold text-foreground">Total</p>
        <p className="text-base font-semibold text-foreground tabular-nums">{formatCents(run.totalCents)}</p>
      </div>

      {/* Ticket 14 puts the Download statement button here. */}
      <div data-slot="statement" />
    </div>
  )
}
