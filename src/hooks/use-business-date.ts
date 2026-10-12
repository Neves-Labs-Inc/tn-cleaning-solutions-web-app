"use client";

import { useEffect, useState } from "react";

import { getBusinessDate } from "@/lib/schedule/business-time";

const CHECK_INTERVAL_MS = 60_000;

// The business date, starting from the server's and kept current: a tab left open past midnight
// (or a month end) would otherwise keep showing the old This week and business month.
export function useBusinessDate(serverBusinessDate: string): string {
  const [businessDate, setBusinessDate] = useState(serverBusinessDate);

  useEffect(() => {
    function handleCheck(): void {
      setBusinessDate(getBusinessDate(new Date()));
    }

    // Timers pause in background tabs, so focus and visibility catch the return.
    const timer = setInterval(handleCheck, CHECK_INTERVAL_MS);
    window.addEventListener("focus", handleCheck);
    document.addEventListener("visibilitychange", handleCheck);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleCheck);
      document.removeEventListener("visibilitychange", handleCheck);
    };
  }, []);

  return businessDate;
}
