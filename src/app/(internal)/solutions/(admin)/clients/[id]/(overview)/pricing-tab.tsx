"use client";

import { BadgeDollarSign, ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ClientJobPricingForm } from "@/components/admin/client-job-pricing-form";
import {
  ItemGroupRow,
  ItemListCard,
  ItemListEmpty,
  ItemSubRow,
  TabLoadError,
} from "@/components/admin/detail-page/item-list";
import { PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import TabToolbar from "@/components/admin/detail-page/tab-toolbar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import {
  type ClientJobPricingRow,
  pricingOverview,
  type PricingHistoryRow,
} from "@/lib/clients/pricing-view";

import HistoryRow from "./history-row";
import type { PricingTabData } from "./load-pricing-tab";
import RateLine from "./rate-line";

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; item: ClientJobPricingRow }
  | null;

type PricingTabProps = {
  clientId: string;
  // Null when the rates or the jobs list failed to load.
  data: PricingTabData | null;
  today: string;
  isReadOnly: boolean;
};

function PricingError({ clientId }: { clientId: string }): React.ReactNode {
  return (
    <TabLoadError
      title="Couldn't load pricing"
      description="Client info is fine; this client's rates didn't load."
      retryHref={`/solutions/clients/${clientId}?tab=pricing`}
    />
  );
}

type PricingHistoryProps = {
  history: PricingHistoryRow[];
  canEdit: boolean;
};

function PricingHistory({
  history,
  canEdit,
}: PricingHistoryProps): React.ReactNode {
  return (
    <Collapsible className="pt-2" defaultOpen={false}>
      <h2>
        <CollapsibleTrigger className="group -mx-1 flex min-h-11 w-[calc(100%+0.5rem)] cursor-pointer items-center justify-between rounded-md px-1 text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted">
          <span>
            History (<span className="tabular-nums">{history.length}</span>)
          </span>
          <ChevronDown
            className="size-5 text-muted-foreground transition-transform duration-fast ease-out-quart group-data-panel-open:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="pt-3 transition-opacity duration-base data-ending-style:opacity-0 data-ending-style:duration-fast data-starting-style:opacity-0">
        <ItemListCard ariaLabel="Rate history">
          {history.map((row) => (
            <HistoryRow key={row.id} row={row} canEdit={canEdit} />
          ))}
        </ItemListCard>
      </CollapsibleContent>
    </Collapsible>
  );
}

// The client page's Pricing tab: rates in force per job, past rates, and the add/edit dialog.
export function PricingTab({
  clientId,
  data,
  today,
  isReadOnly,
}: PricingTabProps): React.ReactNode {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, setIsPending] = useState(false);
  // Kept while the dialog animates closed, so its title doesn't flip mid-exit.
  const [lastDialog, setLastDialog] = useState<DialogState>(null);
  if (dialog !== null && dialog !== lastDialog) setLastDialog(dialog);

  if (data === null) {
    return (
      <>
        <TabToolbar description="Hourly rates that override a job's standard rate." />
        <PricingError clientId={clientId} />
      </>
    );
  }

  const { jobs, history } = pricingOverview(data.rows, today);
  const isEmpty = jobs.length === 0 && history.length === 0;
  const canEdit = !isReadOnly;
  const shownDialog = dialog ?? lastDialog;
  const editing = shownDialog?.mode === "edit" ? shownDialog.item : null;

  function handleEdit(row: ClientJobPricingRow): void {
    setDialog({ mode: "edit", item: row });
  }

  function handleSuccess(): void {
    const isEdit = dialog?.mode === "edit";
    setDialog(null);
    toast.success(isEdit ? "Rate saved" : "Rate added");
    router.refresh();
  }

  const addButton = (
    <Button className={PRESS_CLASS_NAME} onClick={() => setDialog({ mode: "add" })}>
      <Plus aria-hidden="true" data-icon="inline-start" />
      Add rate
    </Button>
  );

  return (
    <>
      <TabToolbar
        description="Hourly rates that override a job's standard rate."
        action={canEdit && !isEmpty ? addButton : undefined}
      />
      {isEmpty ? (
        <ItemListEmpty
          icon={BadgeDollarSign}
          title="No custom pricing"
          description={
            isReadOnly
              ? "This client is archived."
              : "Appointments bill each job's standard hourly rate."
          }
          action={canEdit ? addButton : undefined}
        />
      ) : null}
      {jobs.length > 0 ? (
        <ItemListCard ariaLabel="Rates">
          {jobs.map((job) => (
            <ItemGroupRow key={job.jobId} title={job.jobName}>
              {job.current ? (
                <RateLine
                  key={job.current.id}
                  row={job.current}
                  kind="current"
                  canEdit={canEdit}
                  onEdit={handleEdit}
                />
              ) : (
                <ItemSubRow>
                  <p className="text-sm text-muted-foreground">
                    No current rate
                  </p>
                </ItemSubRow>
              )}
              {job.scheduled.map((row) => (
                <RateLine
                  key={row.id}
                  row={row}
                  kind="scheduled"
                  canEdit={canEdit}
                  onEdit={handleEdit}
                />
              ))}
            </ItemGroupRow>
          ))}
        </ItemListCard>
      ) : null}
      {jobs.length === 0 && history.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          No rates in force. Every job bills its standard hourly rate.
        </p>
      ) : null}
      {history.length > 0 ? (
        <PricingHistory history={history} canEdit={canEdit} />
      ) : null}
      {canEdit ? (
        <ResponsiveDialog
          open={dialog !== null}
          onOpenChange={(isOpen) => (isOpen ? null : setDialog(null))}
          title={editing ? "Edit rate" : "Add rate"}
          description={editing ? editing.job_name : undefined}
          isPending={isPending}
        >
          {shownDialog ? (
            <ClientJobPricingForm
              key={editing?.id ?? "new"}
              clientId={clientId}
              jobs={data.jobs}
              businessDate={today}
              pricing={editing ?? undefined}
              onSuccess={handleSuccess}
              onCancel={() => setDialog(null)}
              onPendingChange={setIsPending}
            />
          ) : null}
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
