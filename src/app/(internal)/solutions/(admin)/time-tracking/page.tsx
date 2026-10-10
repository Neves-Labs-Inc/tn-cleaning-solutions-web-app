import { Suspense } from "react";

import CleanerDrilldown from "@/components/admin/time-sheets/cleaner-drilldown";
import CleanerDrilldownSkeleton from "@/components/admin/time-sheets/cleaner-drilldown-skeleton";
import CleanerSummaryList from "@/components/admin/time-sheets/cleaner-summary";
import RangeBar from "@/components/admin/time-sheets/range-bar";
import TimeSheetsSummarySkeleton from "@/components/admin/time-sheets/summary-skeleton";
import SummaryTiles from "@/components/admin/time-sheets/summary-tiles";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { buildDrilldownDays } from "@/lib/time-sheets/drilldown-days";
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

type SummaryPageProps = {
  range: WeekRange;
  cleanerId?: string;
  children: React.ReactNode;
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

type SummaryBodyProps = {
  range: WeekRange;
  cleaners: CleanerRef[];
  now: Date;
};

type CleanerContentProps = {
  range: WeekRange;
  cleanerId: string;
  now: Date;
};

async function SummaryBody({
  range,
  cleaners,
  now,
}: SummaryBodyProps): Promise<React.ReactNode> {
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

// Reads on its own so the header and range bar stay on screen while it streams in.
async function SummaryContent({
  range,
  now,
}: Omit<SummaryBodyProps, "cleaners">): Promise<React.ReactNode> {
  const cleaners = await fetchActiveCleaners();
  return <SummaryBody range={range} cleaners={cleaners} now={now} />;
}

function SummaryPage({
  range,
  cleanerId,
  children,
}: SummaryPageProps): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader title="Time Sheets" />
      <RangeBar range={range} cleanerId={cleanerId} />
      {children}
    </div>
  );
}

// Owns the whole drill-down (back link, name, range bar) so its skeleton can stand in for all
// of it; an unknown or archived Cleaner falls back to the summary layout.
async function CleanerContent({
  range,
  cleanerId,
  now,
}: CleanerContentProps): Promise<React.ReactNode> {
  const cleaners = await fetchActiveCleaners();
  const selected = cleaners.find((cleaner) => cleaner.id === cleanerId);
  if (!selected) {
    return (
      <SummaryPage range={range} cleanerId={cleanerId}>
        <SummaryBody range={range} cleaners={cleaners} now={now} />
      </SummaryPage>
    );
  }

  const db = await createClient();
  const rows = await fetchAdminSessions(db, range, selected.id);
  const views = rows.map((row) => buildSessionView(row, now));
  const [summary] = summarizeCleaners(views, [selected]);

  return (
    <CleanerDrilldown
      cleaner={selected}
      summary={summary}
      days={buildDrilldownDays(views)}
      range={range}
    />
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

  if (cleanerId) {
    return (
      // A new key per Cleaner and range remounts the boundary, so the drill-down skeleton shows on every change.
      <Suspense
        key={`${cleanerId}:${range.from}:${range.to}`}
        fallback={<CleanerDrilldownSkeleton />}
      >
        <CleanerContent range={range} cleanerId={cleanerId} now={now} />
      </Suspense>
    );
  }

  return (
    <SummaryPage range={range}>
      {/* A new key per range remounts the boundary, so the skeleton shows on every range change. */}
      <Suspense
        key={`${range.from}:${range.to}`}
        fallback={<TimeSheetsSummarySkeleton />}
      >
        <SummaryContent range={range} now={now} />
      </Suspense>
    </SummaryPage>
  );
}
