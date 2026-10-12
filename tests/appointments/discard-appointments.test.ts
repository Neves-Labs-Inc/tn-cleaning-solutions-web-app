import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { discardAppointments } from "../../src/lib/appointments/discard-appointments.ts";

const WEEK_KEY = ["appointments", "week", "2026-10-11"];
const NEEDS_BILLING_KEY = ["appointments", "needs-billing"];
const PAYMENT_METHODS_KEY = ["appointments", "payment-methods"];
const OTHER_KEY = ["invoices", "list"];

// An observer the way a mounted screen holds a query: subscribed, over cached data it won't
// refetch on its own.
function observe(
  queryClient: QueryClient,
  queryKey: string[],
  queryFn: () => Promise<string>,
  isEnabled = true,
): () => void {
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn,
    staleTime: Infinity,
    enabled: isEnabled,
  });
  return observer.subscribe(() => {});
}

describe("discardAppointments", () => {
  it("drops the data of appointments queries no screen is using", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(WEEK_KEY, "old week");

    await discardAppointments(queryClient);

    assert.equal(queryClient.getQueryData(WEEK_KEY), undefined);
  });

  it("keeps an active query's rows while it refetches, then swaps in the fresh ones", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(NEEDS_BILLING_KEY, "old rows");
    let calls = 0;
    const unsubscribe = observe(queryClient, NEEDS_BILLING_KEY, async () => {
      calls += 1;
      return "fresh rows";
    });

    const discarding = discardAppointments(queryClient);
    assert.equal(queryClient.getQueryData(NEEDS_BILLING_KEY), "old rows");
    await discarding;

    assert.equal(calls, 1);
    assert.equal(queryClient.getQueryData(NEEDS_BILLING_KEY), "fresh rows");
    unsubscribe();
  });

  it("resets a query held only by a disabled observer, keeping it in the cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PAYMENT_METHODS_KEY, "old methods");
    let calls = 0;
    const unsubscribe = observe(
      queryClient,
      PAYMENT_METHODS_KEY,
      async () => {
        calls += 1;
        return "fresh methods";
      },
      false,
    );

    await discardAppointments(queryClient);
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: PAYMENT_METHODS_KEY, exact: true });

    assert.equal(calls, 0);
    assert.equal(query?.state.data, undefined);
    assert.equal(query?.getObserversCount(), 1);
    unsubscribe();
  });

  it("leaves queries outside appointments alone", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(OTHER_KEY, "invoices");

    await discardAppointments(queryClient);
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: OTHER_KEY, exact: true });

    assert.equal(query?.state.data, "invoices");
    assert.equal(query?.state.isInvalidated, false);
  });
});
