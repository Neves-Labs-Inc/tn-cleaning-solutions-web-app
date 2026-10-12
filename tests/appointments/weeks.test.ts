import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AppointmentsQuery,
  ScheduleAppointment,
} from "../../src/lib/appointments/overview.ts";
import { getReadRange } from "../../src/lib/appointments/range.ts";
import {
  bucketByWeek,
  getWeeksSpan,
  groupWeekReads,
  MAX_SPAN_WEEKS,
  mergeWeeks,
  missingWeeks,
  parseWeeksSpan,
  weeksForRange,
} from "../../src/lib/appointments/weeks.ts";

// A Sunday, so the business week starts today.
const BUSINESS_DATE = "2026-10-11";

const THIS_WEEK: AppointmentsQuery = {
  view: "schedule",
  layout: "week",
  from: null,
  weeks: 8,
  month: 10,
  year: 2026,
  showCancelled: false,
  clientId: "",
  jobId: "",
  status: "all",
};

function visit(
  id: string,
  scheduledDate: string,
  startTime = "09:00:00",
): ScheduleAppointment {
  return {
    id,
    clientId: "smith",
    clientName: "Maria Silva",
    jobId: "standard",
    jobName: "Standard clean",
    scheduledDate,
    startTime,
    endTime: "12:00:00",
    status: "scheduled",
    priceCents: null,
    paymentState: null,
    claim: null,
    isNotClocked: false,
  };
}

function idsOf(appointments: ScheduleAppointment[]): string[] {
  return appointments.map((appointment) => appointment.id);
}

function weeksOf(query: Partial<AppointmentsQuery>): string[] {
  return weeksForRange(getReadRange({ ...THIS_WEEK, ...query }, BUSINESS_DATE));
}

describe("weeksForRange", () => {
  it("covers a single week", () => {
    assert.deepEqual(weeksForRange({ from: "2026-10-11", to: "2026-10-17" }), [
      "2026-10-11",
    ]);
  });

  it("covers the eight weeks the Week layout reads", () => {
    assert.deepEqual(weeksOf({ layout: "week", weeks: 8 }), [
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
  });

  it("covers exactly as many weeks as the List layout shows", () => {
    const sixteen = weeksOf({ layout: "list", weeks: 16 });
    const all = weeksOf({ layout: "list", weeks: 104 });

    assert.equal(weeksOf({ layout: "list", weeks: 8 }).length, 8);
    assert.equal(sixteen.length, 16);
    assert.equal(sixteen.at(-1), "2027-01-24");
    assert.equal(all.length, 104);
    assert.equal(all.at(-1), "2028-10-01");
  });

  it("covers every week touching a five-week month", () => {
    assert.deepEqual(weeksOf({ layout: "month", month: 10, year: 2026 }), [
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
  });

  it("covers every week touching a six-week month", () => {
    assert.deepEqual(weeksOf({ layout: "month", month: 8, year: 2026 }), [
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
      "2026-08-16",
      "2026-08-23",
      "2026-08-30",
    ]);
  });

  it("starts a month that begins on a Sunday on its 1st", () => {
    assert.deepEqual(weeksOf({ layout: "month", month: 11, year: 2026 }), [
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
    assert.deepEqual(weeksOf({ layout: "month", month: 2, year: 2026 }), [
      "2026-02-01",
      "2026-02-08",
      "2026-02-15",
      "2026-02-22",
    ]);
  });

  it("crosses a year boundary", () => {
    assert.deepEqual(weeksForRange({ from: "2026-12-27", to: "2027-01-09" }), [
      "2026-12-27",
      "2027-01-03",
    ]);
    assert.deepEqual(weeksOf({ layout: "month", month: 1, year: 2027 }), [
      "2026-12-27",
      "2027-01-03",
      "2027-01-10",
      "2027-01-17",
      "2027-01-24",
      "2027-01-31",
    ]);
  });
});

describe("missingWeeks", () => {
  it("reports only the weeks that aren't cached", () => {
    const cached = new Set(["2026-10-11", "2026-10-25"]);

    const missing = missingWeeks(
      ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"],
      (week) => cached.has(week),
    );

    assert.deepEqual(missing, ["2026-10-18", "2026-11-01"]);
  });

  it("needs only the eight new weeks when Show more goes from 8 to 16", () => {
    const cached = new Set(weeksOf({ layout: "list", weeks: 8 }));

    const missing = missingWeeks(weeksOf({ layout: "list", weeks: 16 }), (week) =>
      cached.has(week),
    );

    assert.deepEqual(missing, [
      "2026-12-06",
      "2026-12-13",
      "2026-12-20",
      "2026-12-27",
      "2027-01-03",
      "2027-01-10",
      "2027-01-17",
      "2027-01-24",
    ]);
  });
});

describe("mergeWeeks", () => {
  it("trims a month's edge weeks to the month", () => {
    const chunks = [
      [visit("sep-28", "2026-09-28"), visit("oct-1", "2026-10-01")],
      [visit("oct-5", "2026-10-05")],
      [visit("oct-31", "2026-10-31")],
      [visit("nov-1", "2026-11-01")],
    ];

    const merged = mergeWeeks(chunks, { from: "2026-10-01", to: "2026-10-31" });

    assert.deepEqual(idsOf(merged), ["oct-1", "oct-5", "oct-31"]);
  });

  it("orders by date, then start time, then id", () => {
    const chunks = [
      [visit("oct-19-b", "2026-10-19"), visit("oct-12-late", "2026-10-12", "14:00:00")],
      [visit("oct-12-early", "2026-10-12", "08:00:00"), visit("oct-19-a", "2026-10-19")],
    ];

    const merged = mergeWeeks(chunks, { from: "2026-10-11", to: "2026-10-24" });

    assert.deepEqual(idsOf(merged), [
      "oct-12-early",
      "oct-12-late",
      "oct-19-a",
      "oct-19-b",
    ]);
  });
});

describe("getWeeksSpan", () => {
  it("spans the first week's Sunday to the last week's Saturday", () => {
    assert.deepEqual(getWeeksSpan(["2026-12-27", "2027-01-03", "2027-01-10"]), {
      from: "2026-12-27",
      to: "2027-01-16",
    });
  });

  it("spans a single week", () => {
    assert.deepEqual(getWeeksSpan(["2026-10-11"]), {
      from: "2026-10-11",
      to: "2026-10-17",
    });
  });
});

describe("bucketByWeek", () => {
  it("files each appointment under the week containing its date, keeping empty weeks", () => {
    const appointments = [
      visit("sun-27", "2026-12-27"),
      visit("sat-2", "2027-01-02"),
      visit("sun-10", "2027-01-10"),
      visit("sat-16", "2027-01-16"),
    ];

    const weeks = bucketByWeek(appointments, {
      from: "2026-12-27",
      to: "2027-01-23",
    });

    assert.deepEqual(
      Object.fromEntries(
        Object.entries(weeks).map(([week, rows]) => [week, idsOf(rows)]),
      ),
      {
        "2026-12-27": ["sun-27", "sat-2"],
        "2027-01-03": [],
        "2027-01-10": ["sun-10", "sat-16"],
        "2027-01-17": [],
      },
    );
  });
});

describe("parseWeeksSpan", () => {
  it("reads a span from one Sunday to another", () => {
    assert.deepEqual(parseWeeksSpan("2026-12-27", "2027-01-10"), {
      from: "2026-12-27",
      to: "2027-01-16",
    });
    assert.deepEqual(parseWeeksSpan("2026-10-11", "2026-10-11"), {
      from: "2026-10-11",
      to: "2026-10-17",
    });
  });

  it("refuses malformed dates and dates that aren't Sundays", () => {
    const refused: Array<[unknown, unknown]> = [
      ["2026-10-12", "2026-10-18"],
      ["2026-10-11", "2026-10-17"],
      ["2026-02-30", "2026-03-01"],
      ["2026-10-1", "2026-10-18"],
      ["next week", "2026-10-18"],
      [20261011, "2026-10-18"],
      [null, "2026-10-18"],
      ["2026-10-11", undefined],
    ];

    for (const [firstWeek, lastWeek] of refused) {
      assert.equal(
        parseWeeksSpan(firstWeek, lastWeek),
        null,
        `${String(firstWeek)}..${String(lastWeek)}`,
      );
    }
  });

  it("refuses a last week before the first", () => {
    assert.equal(parseWeeksSpan("2026-10-18", "2026-10-11"), null);
  });

  it("allows up to 110 weeks and refuses more", () => {
    // The 110th week from 2026-10-11 starts 2028-11-12; the 111th, 2028-11-19.
    assert.notEqual(parseWeeksSpan("2026-10-11", "2028-11-12"), null);
    assert.equal(parseWeeksSpan("2026-10-11", "2028-11-19"), null);
  });
});

describe("groupWeekReads", () => {
  it("reads a run of weeks in one go, in order and without repeats", () => {
    assert.deepEqual(
      groupWeekReads(["2026-10-25", "2026-10-11", "2026-10-18", "2026-10-11"]),
      [["2026-10-11", "2026-10-18", "2026-10-25"]],
    );
  });

  it("reads across a short run of cached weeks rather than splitting", () => {
    // Show more after the middle weeks were cached: one read re-reads the gap.
    assert.deepEqual(groupWeekReads(["2026-10-11", "2026-11-15"]), [
      ["2026-10-11", "2026-11-15"],
    ]);
  });

  it("splits weeks far apart into separate reads", () => {
    // A range a year back and the business month: reading the year between is waste.
    assert.deepEqual(
      groupWeekReads(["2025-10-12", "2025-10-19", "2026-10-04", "2026-10-11"]),
      [
        ["2025-10-12", "2025-10-19"],
        ["2026-10-04", "2026-10-11"],
      ],
    );
  });

  it("keeps every read within the span the loader accepts", () => {
    // 120 weeks, more than one read may span.
    const contiguous = weeksForRange({ from: "2026-10-11", to: "2029-01-27" });

    const reads = groupWeekReads(contiguous);

    assert.deepEqual(
      reads.map((read) => read.length),
      [MAX_SPAN_WEEKS, 120 - MAX_SPAN_WEEKS],
    );
    assert.deepEqual(reads.flat(), contiguous);
  });

  it("reads nothing for no weeks", () => {
    assert.deepEqual(groupWeekReads([]), []);
  });
});
