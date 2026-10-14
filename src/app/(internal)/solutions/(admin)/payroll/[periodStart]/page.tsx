import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, Wallet } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import PayRunList from "@/components/admin/payroll/pay-run-list";
import { PeriodStatusBadge } from "@/components/admin/payroll/payroll-badges";
import StragglersSection from "@/components/admin/payroll/stragglers-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import PageHeader from "@/components/ui/page-header";
import {
  describePeriodHeader,
  formatFinalizeOpens,
} from "@/lib/payroll/format";
import { parsePeriodParam } from "@/lib/payroll/period";
import { buildPeriodView } from "@/lib/payroll/period-view";
import { fetchPayPeriodData } from "@/lib/payroll/queries";
import { formatCents } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type PayPeriodPageProps = {
  params: Promise<{ periodStart: string }>;
};

const PAY_PERIODS_PATH = "/solutions/payroll";

function NoRuns({ isEnded }: { isEnded: boolean }): React.ReactNode {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Wallet aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No pay this period</EmptyTitle>
        <EmptyDescription>
          {isEnded
            ? "No Cleaner clocked a shift or had a clock problem in this period."
            : "Drafts show up here as Cleaners clock shifts."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export default async function PayPeriodPage({
  params,
}: PayPeriodPageProps): Promise<React.ReactNode> {
  const { periodStart } = await params;
  const now = new Date();
  const period = parsePeriodParam(periodStart, now);
  if (period === null) notFound();

  const db = await createClient();
  const data = await fetchPayPeriodData(db, period.start);
  const view = buildPeriodView(data, period, now);
  const hasRuns = view.runs.length > 0;
  const opensOn = view.status.finalizeOpensOn;

  return (
    <div className="space-y-6 lg:space-y-8">
      <Button
        variant="ghost"
        className={cn("-ml-3", OUTLINE_PRESS_CLASS_NAME)}
        nativeButton={false}
        render={<Link href={PAY_PERIODS_PATH} />}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        Pay periods
      </Button>

      <div className="animate-in space-y-6 duration-slow fade-in-0 lg:space-y-8">
        <div className="space-y-3">
          <PageHeader
            title={`Pay period ${view.label}`}
            description={describePeriodHeader(view)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <PeriodStatusBadge kind={hasRuns ? view.status.kind : "no_pay"} />
            <span className="text-sm text-muted-foreground">
              Period total{" "}
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {formatCents(view.totals.totalCents)}
              </span>
            </span>
          </div>
        </div>

        {opensOn === null ? null : (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              This period is still running. Drafts update live as Cleaners
              clock; they can be finalized from {formatFinalizeOpens(opensOn)}.
            </AlertDescription>
          </Alert>
        )}

        {view.isEnded && view.stragglers.length > 0 ? (
          <StragglersSection stragglers={view.stragglers} />
        ) : null}

        {hasRuns ? (
          <PayRunList
            runs={view.runs}
            periodStatus={view.status}
            totals={view.totals}
          />
        ) : (
          <NoRuns isEnded={view.isEnded} />
        )}
      </div>
    </div>
  );
}
