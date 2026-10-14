import { Suspense } from "react";

import CleanerDrilldown from "@/components/admin/time-sheets/cleaner-drilldown";
import CleanerDrilldownSkeleton from "@/components/admin/time-sheets/cleaner-drilldown-skeleton";
import CleanerSummaryList from "@/components/admin/time-sheets/cleaner-summary";
import RangeBar from "@/components/admin/time-sheets/range-bar";
import TimeSheetsSummarySkeleton from "@/components/admin/time-sheets/summary-skeleton";
import SummaryTiles from "@/components/admin/time-sheets/summary-tiles";
import TimeSheetsSearch from "@/components/admin/time-sheets/time-sheets-search";
import PageHeader from "@/components/ui/page-header";
import { singleParam } from "@/lib/admin/list-query";
import { createClient } from "@/lib/supabase/server";
import { buildDrilldownDays } from "@/lib/time-sheets/drilldown-days";
import { fetchAdminSessions } from "@/lib/time-sheets/queries";
import { resolveWeekRange, type WeekRange } from "@/lib/time-sheets/range";
import { buildSessionView } from "@/lib/time-sheets/session-view";
import {
  filterSummariesByName,
  summarizeCleaners,
  type CleanerRef,
} from "@/lib/time-sheets/summaries";

type AdminTimeSheetsPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    cleaner?: string | string[];
    q?: string | string[];
  }>;
};

type SummaryPageProps = {
  range: WeekRange;
  cleanerId?: string;
  q: string;
  cleaners: CleanerRef[];
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

type SummaryBodyProps = {
  range: WeekRange;
  q: string;
  cleaners: CleanerRef[];
  now: Date;
};

type CleanerContentProps = {
  range: WeekRange;
  cleanerId: string;
  q: string;
  now: Date;
};

async function SummaryBody({
  range,
  q,
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
      <CleanerSummaryList
        summaries={filterSummariesByName(summaries, q)}
        totalCount={summaries.length}
        range={range}
        q={q}
      />
    </div>
  );
}

function SummaryPage({
  range,
  cleanerId,
  q,
  cleaners,
  now,
}: SummaryPageProps): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader title="Time Sheets" />
      <RangeBar range={range} cleanerId={cleanerId} q={q} />
      <TimeSheetsSearch range={range} q={q} showSearch={cleaners.length > 0}>
        {/* The key is range-only, so typing a search never remounts it or shows the skeleton. */}
        <Suspense
          key={`${range.from}:${range.to}`}
          fallback={<TimeSheetsSummarySkeleton />}
        >
          <SummaryBody range={range} q={q} cleaners={cleaners} now={now} />
        </Suspense>
      </TimeSheetsSearch>
    </div>
  );
}

// Owns the whole drill-down (back link, name, range bar) so its skeleton can stand in for all
// of it; an unknown or archived Cleaner falls back to the summary layout.
async function CleanerContent({
  range,
  cleanerId,
  q,
  now,
}: CleanerContentProps): Promise<React.ReactNode> {
  const cleaners = await fetchActiveCleaners();
  const selected = cleaners.find((cleaner) => cleaner.id === cleanerId);
  if (!selected) {
    return (
      <SummaryPage
        range={range}
        cleanerId={cleanerId}
        q={q}
        cleaners={cleaners}
        now={now}
      />
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
      q={q}
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
  const q = singleParam(params.q)?.trim() ?? "";

  if (cleanerId) {
    return (
      // A new key per Cleaner and range remounts the boundary, so the drill-down skeleton shows on every change.
      <Suspense
        key={`${cleanerId}:${range.from}:${range.to}`}
        fallback={<CleanerDrilldownSkeleton />}
      >
        <CleanerContent
          range={range}
          cleanerId={cleanerId}
          q={q}
          now={now}
        />
      </Suspense>
    );
  }

  const cleaners = await fetchActiveCleaners();
  return (
    <SummaryPage range={range} q={q} cleaners={cleaners} now={now} />
  );
}
