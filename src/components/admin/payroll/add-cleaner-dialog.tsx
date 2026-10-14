"use client";

import { useState } from "react";
import { Search, UserCheck, UserPlus } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { usePeriodActions } from "@/components/admin/payroll/period-actions-context";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import { Spinner } from "@/components/ui/spinner";
import StatusBadge from "@/components/ui/status-badge";
import { useAddCleaner } from "@/hooks/use-add-cleaner";
import type { CleanerCandidate } from "@/lib/payroll/period-actions";
import { getRunKey } from "@/lib/payroll/period-view";
import { cn } from "@/lib/utils";

type AddCleanerDialogProps = {
  candidates: CleanerCandidate[];
  className?: string;
};

// More than this many Cleaners and the picker gets a search field.
const SEARCH_THRESHOLD = 8;

function matches(candidate: CleanerCandidate, query: string): boolean {
  return candidate.name.toLowerCase().includes(query.trim().toLowerCase());
}

// "Add Cleaner" on an ended period: picks a Cleaner with no run and gives her a $0 draft.
export default function AddCleanerDialog({
  candidates,
  className,
}: AddCleanerDialogProps): React.ReactNode {
  const periodActions = usePeriodActions();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const periodLabel = periodActions?.periodLabel ?? "";

  function handleAdded(employeeId: string): void {
    setIsOpen(false);
    periodActions?.expand(getRunKey(employeeId, "regular", null), {
      shouldOpenAdjustmentForm: true,
    });
  }

  const adder = useAddCleaner({
    periodStart: periodActions?.periodStart ?? "",
    periodLabel,
    onAdded: handleAdded,
  });

  function handleOpenChange(isNowOpen: boolean): void {
    setIsOpen(isNowOpen);
    if (!isNowOpen) {
      setQuery("");
      adder.clearRefusal();
    }
  }

  if (periodActions === null || !periodActions.isEnded) return null;

  const hasSearch = candidates.length > SEARCH_THRESHOLD;
  const shown = candidates.filter((item) => matches(item, query));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        // ADD_CLEANER_TRIGGER_ATTRIBUTE: focus lands here after Remove from period.
        data-add-cleaner-trigger=""
        className={cn(OUTLINE_PRESS_CLASS_NAME, className)}
        onClick={() => setIsOpen(true)}
      >
        <UserPlus data-icon="inline-start" aria-hidden="true" />
        Add Cleaner
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={`Add a Cleaner to ${periodLabel}`}
        description="She gets a $0 draft you can add an Adjustment to."
        isPending={adder.isPending}
      >
        {candidates.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Everyone already has a run in this period</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3 pb-1">
            {adder.refusal === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {adder.refusal}
              </p>
            )}
            {hasSearch ? (
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  enterKeyHint="search"
                  placeholder="Search Cleaners"
                  aria-label="Search Cleaners"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </InputGroup>
            ) : null}
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Cleaner matches “{query.trim()}”
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {shown.map((candidate) => {
                  const isRowPending = adder.pendingId === candidate.id;
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        disabled={adder.isPending}
                        aria-busy={isRowPending || undefined}
                        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-[background-color,box-shadow] duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted disabled:cursor-not-allowed disabled:opacity-60 md:hover:bg-muted"
                        onClick={() => adder.add(candidate)}
                      >
                        <span className="min-w-0 font-medium break-words">
                          {candidate.name}
                        </span>
                        {isRowPending ? (
                          <Spinner
                            aria-hidden="true"
                            role="presentation"
                            aria-label={undefined}
                          />
                        ) : candidate.isActive ? null : (
                          <StatusBadge tone="neutral">Inactive</StatusBadge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
