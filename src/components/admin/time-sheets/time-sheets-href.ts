export const TIME_SHEETS_PATH = "/solutions/time-tracking";

type TimeSheetsHrefParts = {
  from?: string;
  to?: string;
  cleaner?: string;
};

// Parts left out stay out of the query: no from/to means "this week".
export function buildTimeSheetsHref({
  from,
  to,
  cleaner,
}: TimeSheetsHrefParts): string {
  const query = new URLSearchParams();
  if (cleaner) query.set("cleaner", cleaner);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const queryString = query.toString();
  return queryString ? `${TIME_SHEETS_PATH}?${queryString}` : TIME_SHEETS_PATH;
}
