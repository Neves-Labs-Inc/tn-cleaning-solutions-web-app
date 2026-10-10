import { BUSINESS_TIME_ZONE, formatBusinessTime } from "@/lib/schedule/business-time";

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  month: "short",
  day: "numeric",
});

// "Oct 6, 2:14 PM" in business time. Parts are joined by hand to stay independent of ICU
// punctuation changes.
export function formatHistoryTime(timestamp: string): string {
  const instant = new Date(timestamp);
  const parts = Object.fromEntries(
    monthDayFormatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.month} ${parts.day}, ${formatBusinessTime(instant)}`;
}
