"use client";

import { ArrowRight, BadgeDollarSign, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  ItemListCard,
  ItemListEmpty,
  TabLoadError,
} from "@/components/admin/detail-page/item-list";
import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import {
  payRatesOverview,
  type PayRateRow,
} from "@/lib/employees/pay-rates-view";
import { cn } from "@/lib/utils";

import { PayRateForm } from "./pay-rate-form";
import PayRateListRow from "./pay-rate-row";

// The add date is fixed when the dialog opens: adding the first rate flips the default while the
// dialog is still animating closed.
type DialogState =
  | { mode: "add"; defaultEffectiveFrom: string }
  | { mode: "edit"; item: PayRateRow }
  | null;

type PaySectionProps = {
  employeeId: string;
  employeeName: string;
  // Null when the rates failed to load; the payout details still render.
  rates: PayRateRow[] | null;
  today: string;
  // A first rate defaults to the Payroll start, so her earliest payable shifts are covered.
  payrollStart: string;
  payrollHref: string;
  defaultPayoutMethod: string | null;
  eTransferContact: string | null;
};

const EYEBROW_CLASS_NAME =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const NOTE_CLASS_NAME = "text-sm text-muted-foreground";

function ArchivedRates({
  rates,
  onEdit,
}: {
  rates: PayRateRow[];
  onEdit: (rate: PayRateRow) => void;
}): React.ReactNode {
  return (
    <Collapsible defaultOpen={false}>
      <h4>
        <CollapsibleTrigger className="group -mx-1 flex min-h-11 w-[calc(100%+0.5rem)] cursor-pointer items-center justify-between rounded-md px-1 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted">
          <span>
            Archived (<span className="tabular-nums">{rates.length}</span>)
          </span>
          <ChevronDown
            className="size-5 text-muted-foreground transition-transform duration-fast ease-out-quart group-data-panel-open:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      </h4>
      <CollapsibleContent className="pt-3 transition-opacity duration-base data-ending-style:opacity-0 data-ending-style:duration-fast data-starting-style:opacity-0">
        <ItemListCard ariaLabel="Archived Pay rates">
          {rates.map((rate) => (
            <PayRateListRow
              key={rate.id}
              rate={rate}
              variant="archived"
              onEdit={onEdit}
            />
          ))}
        </ItemListCard>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PayoutDetails({
  employeeId,
  defaultPayoutMethod,
  eTransferContact,
}: Pick<
  PaySectionProps,
  "employeeId" | "defaultPayoutMethod" | "eTransferContact"
>): React.ReactNode {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Payout details</h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className={EYEBROW_CLASS_NAME}>Default Payout method</dt>
          <dd className={cn("text-sm break-words", !defaultPayoutMethod && "text-muted-foreground")}>
            {defaultPayoutMethod || "Not set"}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className={EYEBROW_CLASS_NAME}>e-Transfer contact</dt>
          <dd className={cn("text-sm break-words", !eTransferContact && "text-muted-foreground")}>
            {eTransferContact || "No e-Transfer contact on file"}
          </dd>
        </div>
      </dl>
      <Link
        href={`/solutions/employees/${employeeId}/edit#payout`}
        className={cn(
          buttonVariants({ variant: "outline" }),
          OUTLINE_PRESS_CLASS_NAME,
          "w-full sm:w-auto",
        )}
      >
        Edit payout details
      </Link>
    </div>
  );
}

// The employee page's Pay section: her Pay rate history with add/edit/archive, and payout details.
export function PaySection({
  employeeId,
  employeeName,
  rates,
  today,
  payrollStart,
  payrollHref,
  defaultPayoutMethod,
  eTransferContact,
}: PaySectionProps): React.ReactNode {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, setIsPending] = useState(false);
  // Kept while the dialog animates closed, so its title doesn't flip mid-exit.
  const [lastDialog, setLastDialog] = useState<DialogState>(null);
  if (dialog !== null && dialog !== lastDialog) setLastDialog(dialog);

  const overview = rates === null ? null : payRatesOverview(rates, today);
  const isEmpty = rates !== null && rates.length === 0;
  const hasLive = overview !== null && overview.live.length > 0;
  const shownDialog = dialog ?? lastDialog;
  const editing = shownDialog?.mode === "edit" ? shownDialog.item : null;

  function handleEdit(rate: PayRateRow): void {
    setDialog({ mode: "edit", item: rate });
  }

  function handleSuccess(): void {
    const isEdit = dialog?.mode === "edit";
    setDialog(null);
    toast.success(isEdit ? "Pay rate saved" : "Pay rate added");
    router.refresh();
  }

  const addButton = (
    <Button
      className={cn(PRESS_CLASS_NAME, "w-full sm:w-auto")}
      onClick={() =>
        setDialog({
          mode: "add",
          defaultEffectiveFrom: hasLive ? today : payrollStart,
        })
      }
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      Add rate
    </Button>
  );

  return (
    <section
      id="pay"
      aria-labelledby="pay-heading"
      className="scroll-mt-20"
    >
      <Card className="gap-6 p-4 text-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 id="pay-heading" className="text-lg font-semibold tracking-tight">
              Pay
            </h2>
            <p className={NOTE_CLASS_NAME}>
              Pay rates, payout method and e-Transfer contact. Only admins see
              this.
            </p>
          </div>
          <Link
            href={payrollHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              OUTLINE_PRESS_CLASS_NAME,
              "w-full sm:w-auto",
            )}
          >
            View in Payroll
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold">Pay rates</h3>
            {hasLive ? addButton : null}
          </div>

          {overview === null ? (
            <TabLoadError
              title="Couldn't load Pay rates"
              description="Her other details are fine; her Pay rates didn't load."
              retryHref={`/solutions/employees/${employeeId}#pay`}
            />
          ) : null}

          {isEmpty ? (
            <ItemListEmpty
              icon={BadgeDollarSign}
              title="No Pay rate yet"
              description="Add her first rate effective from the Payroll start (Oct 5, 2026)."
              action={addButton}
            />
          ) : null}

          {overview !== null && !isEmpty && !hasLive ? (
            <>
              <p className={NOTE_CLASS_NAME}>
                No active Pay rate. Her shifts can&apos;t be paid until you add
                one.
              </p>
              {addButton}
            </>
          ) : null}

          {hasLive && !overview.hasCurrent ? (
            <p className={NOTE_CLASS_NAME}>No rate in effect today.</p>
          ) : null}

          {hasLive ? (
            <ItemListCard ariaLabel="Pay rates">
              {overview.live.map((rate) => (
                <PayRateListRow
                  key={rate.id}
                  rate={rate}
                  variant={rate.kind}
                  onEdit={handleEdit}
                />
              ))}
            </ItemListCard>
          ) : null}

          {overview !== null && overview.archived.length > 0 ? (
            <ArchivedRates rates={overview.archived} onEdit={handleEdit} />
          ) : null}
        </div>

        <PayoutDetails
          employeeId={employeeId}
          defaultPayoutMethod={defaultPayoutMethod}
          eTransferContact={eTransferContact}
        />
      </Card>

      {overview !== null ? (
        <ResponsiveDialog
          open={dialog !== null}
          onOpenChange={(isOpen) => (isOpen ? null : setDialog(null))}
          title={editing ? "Edit Pay rate" : "Add Pay rate"}
          description={employeeName}
          isPending={isPending}
        >
          {shownDialog ? (
            <PayRateForm
              key={editing?.id ?? "new"}
              employeeId={employeeId}
              rate={editing ?? undefined}
              defaultEffectiveFrom={
                shownDialog.mode === "add"
                  ? shownDialog.defaultEffectiveFrom
                  : shownDialog.item.effective_from
              }
              onSuccess={handleSuccess}
              onCancel={() => setDialog(null)}
              onPendingChange={setIsPending}
            />
          ) : null}
        </ResponsiveDialog>
      ) : null}
    </section>
  );
}
