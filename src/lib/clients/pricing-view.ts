export type ClientJobPricingRow = {
  id: string;
  job_id: string;
  job_name: string;
  hourly_rate_cents: number;
  effective_from: string;
  notes: string | null;
  is_archived: boolean;
};

export type HistoryStatus = "Superseded" | "Archived";

export type PricingHistoryRow = ClientJobPricingRow & { status: HistoryStatus };

export type JobPricing = {
  jobId: string;
  jobName: string;
  current: ClientJobPricingRow | null;
  scheduled: ClientJobPricingRow[];
};

export type PricingOverview = {
  jobs: JobPricing[];
  history: PricingHistoryRow[];
};

function byNewestFirst(
  left: ClientJobPricingRow,
  right: ClientJobPricingRow,
): number {
  return right.effective_from.localeCompare(left.effective_from);
}

// Splits a client's rates into what bills now, what starts later, and everything else.
// `today` is the business date (YYYY-MM-DD), so plain string comparison orders dates.
export function pricingOverview(
  rows: ClientJobPricingRow[],
  today: string,
): PricingOverview {
  const newestFirst = [...rows].sort(byNewestFirst);
  const unarchived = newestFirst.filter((row) => !row.is_archived);
  const jobIds = [...new Set(unarchived.map((row) => row.job_id))];

  const jobs = jobIds
    .map((jobId) => {
      const jobRows = unarchived.filter((row) => row.job_id === jobId);
      return {
        jobId,
        jobName: jobRows[0].job_name,
        current: jobRows.find((row) => row.effective_from <= today) ?? null,
        scheduled: jobRows
          .filter((row) => row.effective_from > today)
          .reverse(),
      };
    })
    .sort(
      (left, right) =>
        left.jobName.localeCompare(right.jobName) ||
        left.jobId.localeCompare(right.jobId),
    );

  const inForceIds = new Set(
    jobs.flatMap((job) => [
      ...(job.current ? [job.current.id] : []),
      ...job.scheduled.map((row) => row.id),
    ]),
  );
  const history = newestFirst
    .filter((row) => !inForceIds.has(row.id))
    .map((row): PricingHistoryRow => ({
      ...row,
      status: row.is_archived ? "Archived" : "Superseded",
    }));

  return { jobs, history };
}
