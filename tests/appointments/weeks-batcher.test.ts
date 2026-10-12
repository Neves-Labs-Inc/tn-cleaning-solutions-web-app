import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ScheduleAppointment } from "../../src/lib/appointments/overview.ts";
import { WeeksBatcher } from "../../src/lib/appointments/weeks-batcher.ts";
import type { AppointmentWeeks } from "../../src/lib/appointments/weeks.ts";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function visit(id: string, scheduledDate: string): ScheduleAppointment {
  return {
    id,
    clientId: "smith",
    clientName: "Maria Silva",
    jobId: "standard",
    jobName: "Standard clean",
    scheduledDate,
    startTime: "09:00:00",
    endTime: "12:00:00",
    status: "scheduled",
    priceCents: null,
    paymentState: null,
    isNotClocked: false,
  } as ScheduleAppointment;
}

// A loader that answers every week of the span with one visit on that week's Sunday.
function createLoader(): {
  calls: Array<[string, string]>;
  load: (first: string, last: string) => Promise<AppointmentWeeks>;
} {
  const calls: Array<[string, string]> = [];
  const load = async (
    first: string,
    last: string,
  ): Promise<AppointmentWeeks> => {
    calls.push([first, last]);
    const weeks: AppointmentWeeks = {};
    const end = new Date(`${last}T12:00:00Z`).getTime();
    for (
      let time = new Date(`${first}T12:00:00Z`).getTime();
      time <= end;
      time += WEEK_MS
    ) {
      const week = new Date(time).toISOString().slice(0, 10);
      weeks[week] = [visit(`visit-${week}`, week)];
    }
    return weeks;
  };
  return { calls, load };
}

describe("WeeksBatcher", () => {
  it("reads weeks asked for in the same tick in one call", async () => {
    const loader = createLoader();
    const batcher = new WeeksBatcher(loader.load, () => {});

    const [first, second] = await Promise.all([
      batcher.load("2026-10-18"),
      batcher.load("2026-10-11"),
    ]);

    assert.deepEqual(loader.calls, [["2026-10-11", "2026-10-18"]]);
    assert.deepEqual(
      first.map((row) => row.id),
      ["visit-2026-10-18"],
    );
    assert.deepEqual(
      second.map((row) => row.id),
      ["visit-2026-10-11"],
    );
  });

  it("reads far apart weeks in separate calls", async () => {
    const loader = createLoader();
    const batcher = new WeeksBatcher(loader.load, () => {});

    await Promise.all([batcher.load("2025-10-12"), batcher.load("2026-10-11")]);

    assert.equal(loader.calls.length, 2);
  });

  it("writes weeks inside the span that nobody asked for", async () => {
    const loader = createLoader();
    const written: string[] = [];
    const batcher = new WeeksBatcher(loader.load, (week) =>
      written.push(week),
    );

    await Promise.all([batcher.load("2026-10-11"), batcher.load("2026-11-01")]);

    assert.deepEqual(written, ["2026-10-18", "2026-10-25"]);
  });

  it("gives a week the read left out an empty list", async () => {
    const batcher = new WeeksBatcher(
      async () => ({}),
      () => {},
    );

    assert.deepEqual(await batcher.load("2026-10-11"), []);
  });

  it("rejects every week of a failed read and still reads the next batch", async () => {
    let shouldFail = true;
    const loader = createLoader();
    const batcher = new WeeksBatcher(
      async (first, last) => {
        if (shouldFail) throw new Error("boom");
        return loader.load(first, last);
      },
      () => {},
    );

    const outcomes = await Promise.allSettled([
      batcher.load("2026-10-11"),
      batcher.load("2026-10-18"),
    ]);
    shouldFail = false;
    const retried = await batcher.load("2026-10-11");

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["rejected", "rejected"],
    );
    assert.deepEqual(
      retried.map((row) => row.id),
      ["visit-2026-10-11"],
    );
  });
});
