import { useState } from "react";

import { getBusinessDate } from "@/lib/schedule/business-time";

// Today's Business date, read once when the calling form mounts. Payout forms mount as their sheet
// opens, so a page left open past midnight still offers the new day as today.
export function useBusinessDateOnOpen(): string {
  const [businessDate] = useState(() => getBusinessDate(new Date()));
  return businessDate;
}
