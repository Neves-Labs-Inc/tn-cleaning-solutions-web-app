import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import CleanerSummaryList from "@/components/admin/time-sheets/cleaner-summary";
import RangeBar from "@/components/admin/time-sheets/range-bar";
import TimeSheetsSummarySkeleton from "@/components/admin/time-sheets/summary-skeleton";
import SummaryTiles from "@/components/admin/time-sheets/summary-tiles";
import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import { buttonVariants } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchAdminSessions } from "@/lib/time-sheets/queries";
import { resolveWeekRange, type WeekRange } from "@/lib/time-sheets/range";
import { buildSessionView } from "@/lib/time-sheets/session-view";
import {
  summarizeCleaners,
  type CleanerRef,
} from "@/lib/time-sheets/summaries";

type AdminTimeSheetsPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    cleaner?: string | string[];
  }>;
};

type SummaryContentProps = {
  range: WeekRange;
  cleanerId?: string;
  now: Date;
};

async function fetchActiveCleaners(): Promise<CleanerRef[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("employees")
    .select("id, full_name")
    .eq("is_archived", false)
    .order("full_name", { ascending: true });
  if (error) throw error;

  return data ?? [];
}

// Reads on its own so the header and range bar stay on screen while it streams in.
async function SummaryContent({
  range,
  cleanerId,
  now,
}: SummaryContentProps): Promise<React.ReactNode> {
  const cleaners = await fetchActiveCleaners();

  const selected = cleaners.find((cleaner) => cleaner.id === cleanerId);
  if (selected) {
    // Ticket 06 replaces this with the Cleaner's session list.
    return (
      <div className="animate-in space-y-4 fade-in-0 duration-slow">
        <Link
          href={buildTimeSheetsHref({ from: range.from, to: range.to })}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          <ArrowLeft aria-hidden="true" />
          All cleaners
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">
          {selected.full_name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Session details are coming soon.
        </p>
      </div>
    );
  }

  const db = await createClient();
  const rows = await fetchAdminSessions(db, range);
  const views = rows.map((row) => buildSessionView(row, now));
  const summaries = summarizeCleaners(views, cleaners);

  return (
    <div className="animate-in space-y-6 fade-in-0 duration-slow lg:space-y-8">
      <SummaryTiles summaries={summaries} />
      <CleanerSummaryList summaries={summaries} range={range} />
    </div>
  );
}

export default async function AdminTimeSheetsPage({
  searchParams,
}: AdminTimeSheetsPageProps): Promise<React.ReactNode> {
  const params = await searchParams;
  const now = new Date();
  const range = resolveWeekRange(params, now);
  const cleanerId = Array.isArray(params.cleaner)
    ? params.cleaner[0]
    : params.cleaner;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader title="Time Sheets" />
      <RangeBar range={range} cleanerId={cleanerId} />
      {/* A new key per range remounts the boundary, so the skeleton shows on every range change. */}
      <Suspense
        key={`${range.from}:${range.to}`}
        fallback={<TimeSheetsSummarySkeleton />}
      >
        <SummaryContent range={range} cleanerId={cleanerId} now={now} />
      </Suspense>
    </div>
  );
}
