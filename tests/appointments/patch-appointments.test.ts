import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";

import type { AppointmentChanges } from "../../src/lib/appointments/appointment-changes.ts";
import { appointmentsKeys } from "../../src/lib/appointments/appointments-keys.ts";
import type { NeedsCompletionAppointment } from "../../src/lib/appointments/needs-completion.ts";
import type { ScheduleAppointment } from "../../src/lib/appointments/overview.ts";
import {
  applyAppointmentChanges,
  refreshAppointments,
  renameInAppointments,
  updateAppointmentsCache,
} from "../../src/lib/appointments/patch-appointments.ts";
import type { NeedsBillingAppointment } from "../../src/lib/invoices/payment-state-queries.ts";

// Two Sunday-start weeks.
const OCT_4 = "2026-10-04";
const OCT_11 = "2026-10-11";
const OCT_18 = "2026-10-18";

type RowSeed = {
  id: string;
  date: string;
  start?: string;
  clientId?: string;
  clientName?: string;
  jobId?: string;
  jobName?: string;
};

function scheduleRow(seed: RowSeed): ScheduleAppointment {
  return {
    id: seed.id,
    clientId: seed.clientId ?? "smith",
    clientName: seed.clientName ?? "Maria Silva",
    jobId: seed.jobId ?? "standard",
    jobName: seed.jobName ?? "Standard clean",
    scheduledDate: seed.date,
    startTime: seed.start ?? "09:00:00",
    endTime: "12:00:00",
    status: "scheduled",
    priceCents: 12000,
    paymentState: null,
    claim: null,
    isNotClocked: false,
  };
}

function billingRow(seed: RowSeed): NeedsBillingAppointment {
  return {
    id: seed.id,
    clientId: seed.clientId ?? "smith",
    clientName: seed.clientName ?? "Maria Silva",
    scheduledDate: seed.date,
    startTime: seed.start ?? "09:00:00",
    endTime: "12:00:00",
    jobId: seed.jobId ?? "standard",
    jobName: seed.jobName ?? "Standard clean",
    livePriceCents: 12000,
  };
}

function completionRow(seed: RowSeed): NeedsCompletionAppointment {
  return {
    id: seed.id,
    clientId: seed.clientId ?? "smith",
    clientName: seed.clientName ?? "Maria Silva",
    jobId: seed.jobId ?? "standard",
    jobName: seed.jobName ?? "Standard clean",
    scheduledDate: seed.date,
    startTime: seed.start ?? "09:00:00",
    endTime: "12:00:00",
    priceCents: 12000,
  };
}

function changes(overrides: Partial<AppointmentChanges>): AppointmentChanges {
  return {
    ids: [],
    schedule: [],
    needsBilling: [],
    needsCompletion: [],
    ...overrides,
  };
}

function idsAt(queryClient: QueryClient, queryKey: readonly unknown[]): string[] | undefined {
  return queryClient
    .getQueryData<Array<{ id: string }>>(queryKey)
    ?.map((row) => row.id);
}

// An observer the way a mounted screen holds a query, with the app's staleness and focus refetch.
function observe(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<unknown>,
  staleTime = 60_000,
): () => void {
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn,
    staleTime,
    refetchOnWindowFocus: true,
  });
  return observer.subscribe(() => {});
}

describe("applyAppointmentChanges", () => {
  it("patches a changed row in place, keeping date, start time and id order", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "a", date: "2026-10-12" }),
      scheduleRow({ id: "edited", date: "2026-10-13" }),
      scheduleRow({ id: "c", date: "2026-10-14" }),
    ]);

    applyAppointmentChanges(
      queryClient,
      changes({
        ids: ["edited"],
        schedule: [scheduleRow({ id: "edited", date: "2026-10-12", start: "08:00:00", clientName: "New" })],
      }),
    );

    const week = queryClient.getQueryData<ScheduleAppointment[]>(appointmentsKeys.week(OCT_11));
    assert.deepEqual(week?.map((row) => row.id), ["edited", "a", "c"]);
    assert.equal(week?.[0].clientName, "New");
  });

  it("moves a row between two cached weeks", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "moved", date: "2026-10-12" }),
      scheduleRow({ id: "stays", date: "2026-10-13" }),
    ]);
    queryClient.setQueryData(appointmentsKeys.week(OCT_18), [
      scheduleRow({ id: "b", date: "2026-10-20" }),
    ]);

    applyAppointmentChanges(
      queryClient,
      changes({ ids: ["moved"], schedule: [scheduleRow({ id: "moved", date: "2026-10-18" })] }),
    );

    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_11)), ["stays"]);
    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_18)), ["moved", "b"]);
  });

  it("never creates a week that isn't cached", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), []);

    applyAppointmentChanges(
      queryClient,
      changes({
        ids: ["new-a", "new-b"],
        schedule: [
          scheduleRow({ id: "new-a", date: "2026-10-11" }),
          scheduleRow({ id: "new-b", date: "2026-10-19" }),
        ],
      }),
    );

    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_11)), ["new-a"]);
    assert.equal(
      queryClient.getQueryCache().find({ queryKey: appointmentsKeys.week(OCT_18) }),
      undefined,
    );
  });

  it("leaves a reset week empty rather than filling it", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_4), [scheduleRow({ id: "old", date: "2026-10-05" })]);
    void queryClient.resetQueries({ queryKey: appointmentsKeys.week(OCT_4) });

    applyAppointmentChanges(
      queryClient,
      changes({ ids: ["new"], schedule: [scheduleRow({ id: "new", date: "2026-10-06" })] }),
    );

    assert.equal(queryClient.getQueryData(appointmentsKeys.week(OCT_4)), undefined);
  });

  it("removes rows for ids with no returned row", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "deleted", date: "2026-10-12" }),
      scheduleRow({ id: "kept", date: "2026-10-13" }),
    ]);

    applyAppointmentChanges(queryClient, changes({ ids: ["deleted"] }));

    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_11)), ["kept"]);
  });

  it("adds and removes rows in Needs billing and Needs completion, in the full read's order", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.needsBilling, [
      billingRow({ id: "billed-now", date: "2026-09-01" }),
      billingRow({ id: "later", date: "2026-10-01" }),
    ]);
    queryClient.setQueryData(appointmentsKeys.needsCompletion, [
      completionRow({ id: "completed-now", date: "2026-09-01" }),
      completionRow({ id: "other", date: "2026-09-02" }),
    ]);

    applyAppointmentChanges(
      queryClient,
      changes({
        ids: ["billed-now", "completed-now", "unbilled-now"],
        needsBilling: [billingRow({ id: "unbilled-now", date: "2026-09-15" })],
        needsCompletion: [],
      }),
    );

    assert.deepEqual(idsAt(queryClient, appointmentsKeys.needsBilling), ["unbilled-now", "later"]);
    assert.deepEqual(idsAt(queryClient, appointmentsKeys.needsCompletion), ["other"]);
  });

  it("leaves uncached Needs lists uncached", () => {
    const queryClient = new QueryClient();

    applyAppointmentChanges(
      queryClient,
      changes({
        ids: ["a"],
        needsBilling: [billingRow({ id: "a", date: "2026-09-15" })],
        needsCompletion: [completionRow({ id: "a", date: "2026-09-15" })],
      }),
    );

    assert.equal(queryClient.getQueryData(appointmentsKeys.needsBilling), undefined);
    assert.equal(queryClient.getQueryData(appointmentsKeys.needsCompletion), undefined);
  });

  it("starts no fetch, and the patched query still refetches on focus once stale", async () => {
    const queryClient = new QueryClient();
    // Mounting subscribes the cache to focus events, as the app's provider does.
    queryClient.mount();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [scheduleRow({ id: "a", date: "2026-10-12" })]);
    let calls = 0;
    const unsubscribe = observe(
      queryClient,
      appointmentsKeys.week(OCT_11),
      async () => {
        calls += 1;
        return [];
      },
      0,
    );
    // The subscribe above refetched the stale seed; count from here.
    await queryClient.cancelQueries();
    calls = 0;

    applyAppointmentChanges(
      queryClient,
      changes({ ids: ["a"], schedule: [scheduleRow({ id: "a", date: "2026-10-13" })] }),
    );
    const query = queryClient.getQueryCache().find({ queryKey: appointmentsKeys.week(OCT_11) });

    assert.equal(calls, 0);
    assert.equal(query?.state.isInvalidated, false);
    assert.equal(query?.state.fetchStatus, "idle");

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await queryClient.getQueryCache().find({ queryKey: appointmentsKeys.week(OCT_11) })?.promise;
    assert.equal(calls, 1);
    focusManager.setFocused(undefined);
    unsubscribe();
    queryClient.unmount();
  });

  it("leaves a patched query fresh for the app's staleness window", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [], { updatedAt: 0 });

    applyAppointmentChanges(
      queryClient,
      changes({ ids: ["a"], schedule: [scheduleRow({ id: "a", date: "2026-10-12" })] }),
    );
    const query = queryClient.getQueryCache().find({ queryKey: appointmentsKeys.week(OCT_11) });

    assert.equal(query?.isStaleByTime(60_000), false);
  });
});

describe("updateAppointmentsCache", () => {
  it("reads the changed rows and patches them in", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), []);
    const asked: string[][] = [];

    await updateAppointmentsCache(queryClient, ["new"], async (ids) => {
      asked.push(ids);
      return changes({ ids, schedule: [scheduleRow({ id: "new", date: "2026-10-12" })] });
    });

    assert.deepEqual(asked, [["new"]]);
    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_11)), ["new"]);
  });

  it("discards the appointments cache when the read fails, so pre-change rows never show", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [scheduleRow({ id: "old", date: "2026-10-12" })]);
    const originalError = console.error;
    console.error = () => {};

    try {
      await updateAppointmentsCache(queryClient, ["old"], async () => {
        throw new Error("read failed");
      });
    } finally {
      console.error = originalError;
    }

    assert.equal(queryClient.getQueryData(appointmentsKeys.week(OCT_11)), undefined);
  });

  it("reads nothing when no appointment changed", async () => {
    const queryClient = new QueryClient();
    let calls = 0;

    await updateAppointmentsCache(queryClient, [], async (ids) => {
      calls += 1;
      return changes({ ids });
    });

    assert.equal(calls, 0);
  });
});

describe("refreshAppointments", () => {
  it("keeps cached rows while an active query refetches", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.needsBilling, [billingRow({ id: "old", date: "2026-09-01" })]);
    let calls = 0;
    const unsubscribe = observe(queryClient, appointmentsKeys.needsBilling, async () => {
      calls += 1;
      return [billingRow({ id: "fresh", date: "2026-09-01" })];
    });

    const refreshing = refreshAppointments(queryClient);
    assert.deepEqual(idsAt(queryClient, appointmentsKeys.needsBilling), ["old"]);
    await refreshing;

    assert.equal(calls, 1);
    assert.deepEqual(idsAt(queryClient, appointmentsKeys.needsBilling), ["fresh"]);
    unsubscribe();
  });

  it("marks an inactive query stale without dropping its rows", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [scheduleRow({ id: "old", date: "2026-10-12" })]);

    await refreshAppointments(queryClient);
    const query = queryClient.getQueryCache().find({ queryKey: appointmentsKeys.week(OCT_11) });

    assert.deepEqual(idsAt(queryClient, appointmentsKeys.week(OCT_11)), ["old"]);
    assert.equal(query?.state.isInvalidated, true);
  });

  it("touches only the given keys", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.needsBilling, []);
    queryClient.setQueryData(appointmentsKeys.filterOptions, {});

    await refreshAppointments(queryClient, [appointmentsKeys.needsBilling]);
    const find = (queryKey: readonly unknown[]) =>
      queryClient.getQueryCache().find({ queryKey, exact: true });

    assert.equal(find(appointmentsKeys.needsBilling)?.state.isInvalidated, true);
    assert.equal(find(appointmentsKeys.filterOptions)?.state.isInvalidated, false);
  });
});

describe("renameInAppointments", () => {
  it("renames a client across the weeks and both Needs lists, without a read", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "a", date: "2026-10-12" }),
      scheduleRow({ id: "b", date: "2026-10-13", clientId: "jones", clientName: "Ana Jones" }),
    ]);
    queryClient.setQueryData(appointmentsKeys.needsBilling, [billingRow({ id: "c", date: "2026-09-01" })]);
    queryClient.setQueryData(appointmentsKeys.needsCompletion, [completionRow({ id: "d", date: "2026-09-01" })]);

    renameInAppointments(queryClient, { kind: "client", id: "smith", name: "Maria Souza" });

    const names = (queryKey: readonly unknown[]) =>
      queryClient
        .getQueryData<Array<{ clientName: string }>>(queryKey)
        ?.map((row) => row.clientName);
    assert.deepEqual(names(appointmentsKeys.week(OCT_11)), ["Maria Souza", "Ana Jones"]);
    assert.deepEqual(names(appointmentsKeys.needsBilling), ["Maria Souza"]);
    assert.deepEqual(names(appointmentsKeys.needsCompletion), ["Maria Souza"]);
  });

  it("renames a Job on matching rows only", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "a", date: "2026-10-12" }),
      scheduleRow({ id: "b", date: "2026-10-13", jobId: "deep", jobName: "Deep clean" }),
    ]);

    renameInAppointments(queryClient, { kind: "job", id: "standard", name: "Regular clean" });

    assert.deepEqual(
      queryClient
        .getQueryData<ScheduleAppointment[]>(appointmentsKeys.week(OCT_11))
        ?.map((row) => row.jobName),
      ["Regular clean", "Deep clean"],
    );
  });

  it("leaves a week stale when the refresh comes after the rename", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(appointmentsKeys.week(OCT_11), [
      scheduleRow({ id: "a", date: "2026-10-12", jobId: "deep" }),
    ]);

    renameInAppointments(queryClient, { kind: "job", id: "deep", name: "Deep clean+" });
    await refreshAppointments(queryClient);

    assert.equal(queryClient.getQueryState(appointmentsKeys.week(OCT_11))?.isInvalidated, true);
  });
});
