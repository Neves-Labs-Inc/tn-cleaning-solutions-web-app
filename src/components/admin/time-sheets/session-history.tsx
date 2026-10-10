import { ArrowRight, CheckCircle2, Pencil } from "lucide-react";

import ClockTime from "@/components/admin/time-sheets/clock-time";
import { formatHistoryTime } from "@/components/admin/time-sheets/format-history-time";
import type {
  HistoryAcknowledgement,
  HistoryCorrection,
} from "@/lib/time-sheets/drilldown-days";

type SessionHistoryProps = {
  corrections: HistoryCorrection[];
  acknowledgements: HistoryAcknowledgement[];
};

type ChangeLineProps = {
  label: string;
  oldValue: string | null;
  newValue: string | null;
};

function ChangeLine({
  label,
  oldValue,
  newValue,
}: ChangeLineProps): React.ReactNode {
  if (oldValue === newValue) return null;

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <del className="text-muted-foreground line-through">
        <ClockTime instant={oldValue} />
      </del>
      <ArrowRight className="size-3.5" aria-hidden="true" />
      <span className="sr-only">to</span>
      <ins className="font-medium no-underline">
        <ClockTime instant={newValue} />
      </ins>
    </p>
  );
}

const EYEBROW =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

// Corrections first, then acknowledgements, each newest first (the caller passes them sorted).
export default function SessionHistory({
  corrections,
  acknowledgements,
}: SessionHistoryProps): React.ReactNode {
  if (corrections.length === 0 && acknowledgements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No changes. These are the Cleaner&apos;s own clocks.
      </p>
    );
  }

  return (
    <div>
      <h4 className={`mb-2 ${EYEBROW}`}>History</h4>
      <ol className="space-y-3">
        {corrections.map((item) => (
          <li key={item.id} className="flex gap-3">
            <Pencil
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {item.correctedByName}
                </span>{" "}
                · {formatHistoryTime(item.correctedAt)}
              </p>
              <ChangeLine
                label="In"
                oldValue={item.oldClockIn}
                newValue={item.newClockIn}
              />
              <ChangeLine
                label="Out"
                oldValue={item.oldClockOut}
                newValue={item.newClockOut}
              />
              <p className="text-sm break-words">
                {item.reason ?? (
                  <span className="text-muted-foreground italic">
                    No reason given
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
        {acknowledgements.map((ack) => (
          <li key={ack.id} className="flex gap-3">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {ack.acknowledgedByName}
                </span>{" "}
                · {formatHistoryTime(ack.acknowledgedAt)} · acknowledged odd
                duration
                {ack.isLapsed ? (
                  <span className="font-medium text-foreground">
                    {" "}
                    (lapsed: clocks changed since)
                  </span>
                ) : null}
              </p>
              <p className="text-sm break-words">{ack.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
