"use client";

import ClockFormFooter from "@/components/admin/time-sheets/clock-form-footer";
import ClockTimeField from "@/components/admin/time-sheets/clock-time-field";
import { SESSION_TABLE_COLUMNS } from "@/components/admin/time-sheets/session-table-rows";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  useClockCorrection,
  type ClockCorrection,
  type ClockField,
  type ClockFixView,
} from "@/hooks/use-clock-correction";
import type { FixAction } from "@/lib/time-sheets/session-view";
import { cn } from "@/lib/utils";

// The read-only cells of the session's table row, each a whole <TableCell>.
export type ReadOnlyCells = {
  visit: React.ReactNode;
  scheduled: React.ReactNode;
  clocked: React.ReactNode;
  status: React.ReactNode;
};

type ClockCorrectionFormProps = {
  view: ClockFixView;
  mode: FixAction;
  // The panel's id: the fix button's aria-controls points at it.
  id: string;
  onClose: () => void;
} & (
  | { layout: "card"; cells?: never }
  | { layout: "row"; cells: ReadOnlyCells }
);

type LayoutProps = {
  correction: ClockCorrection;
  id: string;
};

const FIELD_LABELS: Record<ClockField, string> = {
  clockIn: "Clock in",
  clockOut: "Clock out",
};
const PANEL_ENTER =
  "animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart";
const EDITING_ROW =
  "bg-muted/40 hover:bg-muted/40 has-aria-expanded:bg-muted/40";

function renderClockField(
  correction: ClockCorrection,
  field: ClockField,
  layout: "row" | "card",
  formId?: string,
): React.ReactNode {
  return (
    <ClockTimeField
      layout={layout}
      id={correction.ids[field]}
      label={FIELD_LABELS[field]}
      value={correction.draft[field]}
      onChange={(part, value) => correction.changeClock(field, part, value)}
      error={correction.errors[field]}
      hint={field === "clockOut" ? correction.clockOutHint : null}
      formId={formId}
      // Row inputs sit outside the <form>, so Escape never bubbles to its handler.
      onKeyDown={formId ? correction.handleKeyDown : undefined}
    />
  );
}

function CardForm({ correction, id }: LayoutProps): React.ReactNode {
  return (
    <form
      id={id}
      noValidate
      aria-label={correction.submitLabel}
      onSubmit={correction.submit}
      onKeyDown={correction.handleKeyDown}
      className={cn("max-w-xl space-y-4", PANEL_ENTER)}
    >
      {correction.prefillHint ? (
        <p className="text-xs text-muted-foreground">
          {correction.prefillHint}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 md:gap-3">
        {renderClockField(correction, "clockIn", "card")}
        {renderClockField(correction, "clockOut", "card")}
      </div>
      <ClockFormFooter correction={correction} layout="card" />
    </form>
  );
}

// Two <tr>s: the clocks in place of the In/Out cells, then a full-width row holding the <form>,
// which the row-1 inputs join through their form attribute.
function RowForm({
  correction,
  id,
  cells,
}: LayoutProps & { cells: ReadOnlyCells }): React.ReactNode {
  return (
    <>
      <TableRow className={cn("border-b-0", EDITING_ROW)}>
        {cells.visit}
        {cells.scheduled}
        <TableCell className="align-top whitespace-normal">
          {renderClockField(correction, "clockIn", "row", id)}
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          {renderClockField(correction, "clockOut", "row", id)}
        </TableCell>
        {cells.clocked}
        {cells.status}
        <TableCell className="w-px px-4" />
      </TableRow>
      <TableRow className={EDITING_ROW}>
        <TableCell
          colSpan={SESSION_TABLE_COLUMNS}
          className="px-4 pt-2 pb-4 whitespace-normal"
        >
          <form
            id={id}
            noValidate
            aria-label={correction.submitLabel}
            onSubmit={correction.submit}
            onKeyDown={correction.handleKeyDown}
            className={cn("flex flex-wrap items-end gap-3", PANEL_ENTER)}
          >
            <ClockFormFooter correction={correction} layout="row" />
          </form>
        </TableCell>
      </TableRow>
    </>
  );
}

// One Clock correction, laid out by the caller: "card" is a stacked form at every width; "row"
// edits a drill-down table row in place and only works inside a <tbody>.
export default function ClockCorrectionForm({
  view,
  mode,
  id,
  onClose,
  layout,
  cells,
}: ClockCorrectionFormProps): React.ReactNode {
  const correction = useClockCorrection(view, mode, onClose);

  return layout === "row" && cells ? (
    <RowForm correction={correction} id={id} cells={cells} />
  ) : (
    <CardForm correction={correction} id={id} />
  );
}
