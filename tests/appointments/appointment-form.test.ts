import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseCreateAppointmentFormData,
  parseUpdateAppointmentFormData,
  parseUpdateRecurrenceFormData,
} from "../../src/lib/appointments/appointment-form.ts";

// An undefined value leaves the field out of the form entirely.
function form(fields: Record<string, string | undefined>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(name, value);
  }
  return formData;
}

const VISIT = {
  client_id: "client-1",
  job_id: "job-1",
  scheduled_date: "2026-03-10",
  scheduled_start_time: "09:00",
  scheduled_end_time: "11:30",
};

const RECURRING_VISIT = {
  ...VISIT,
  is_recurring: "on",
  recurrence_interval_count: "1",
  recurrence_interval_unit: "week",
};

const visitParsers = [
  ["parseCreateAppointmentFormData", parseCreateAppointmentFormData],
  ["parseUpdateAppointmentFormData", parseUpdateAppointmentFormData],
] as const;

for (const [name, parse] of visitParsers) {
  describe(name, () => {
    it("accepts a normal visit from 09:00 to 11:30", () => {
      const result = parse(form(VISIT));

      assert.equal(result.success, true);
      assert.equal(result.success && result.data.scheduled_date, "2026-03-10");
      assert.equal(result.success && result.data.scheduled_start_time, "09:00");
      assert.equal(result.success && result.data.scheduled_end_time, "11:30");
    });

    it("accepts a leap day", () => {
      const result = parse(form({ ...VISIT, scheduled_date: "2028-02-29" }));

      assert.equal(result.success, true);
      assert.equal(result.success && result.data.scheduled_date, "2028-02-29");
    });

    it("refuses an impossible date under the date field", () => {
      const result = parse(form({ ...VISIT, scheduled_date: "2026-02-31" }));

      assert.equal(result.success, false);
      assert.deepEqual(!result.success && result.fieldErrors, {
        scheduled_date: "Enter a valid date.",
      });
    });

    it("refuses 25:00 under the start and end time fields", () => {
      const result = parse(
        form({
          ...VISIT,
          scheduled_start_time: "25:00",
          scheduled_end_time: "25:00",
        }),
      );

      assert.equal(result.success, false);
      assert.deepEqual(!result.success && result.fieldErrors, {
        scheduled_start_time: "Enter a valid start time.",
        scheduled_end_time: "Enter a valid end time.",
      });
    });

    it("refuses 12:60 under the start and end time fields", () => {
      const result = parse(
        form({
          ...VISIT,
          scheduled_start_time: "12:60",
          scheduled_end_time: "12:60",
        }),
      );

      assert.equal(result.success, false);
      assert.deepEqual(!result.success && result.fieldErrors, {
        scheduled_start_time: "Enter a valid start time.",
        scheduled_end_time: "Enter a valid end time.",
      });
    });

    it("keeps the invalid-time message when only the end time is impossible", () => {
      // 08:60 counts as 09:00 in minutes, so comparing it would wrongly say "not after start".
      const result = parse(form({ ...VISIT, scheduled_end_time: "08:60" }));

      assert.deepEqual(!result.success && result.fieldErrors, {
        scheduled_end_time: "Enter a valid end time.",
      });
    });

    it("refuses an end time that is not after the start time", () => {
      const result = parse(form({ ...VISIT, scheduled_end_time: "09:00" }));

      assert.deepEqual(!result.success && result.fieldErrors, {
        scheduled_end_time: "End time must be after start time.",
      });
    });
  });
}

describe("parseCreateAppointmentFormData recurrence", () => {
  it("accepts a recurring visit with a normal end date", () => {
    const result = parseCreateAppointmentFormData(
      form({ ...RECURRING_VISIT, recurrence_end_date: "2026-06-30" }),
    );

    assert.equal(result.success, true);
    assert.equal(
      result.success && result.data.recurrence_end_date,
      "2026-06-30",
    );
  });

  it("accepts a leap-day end date", () => {
    const result = parseCreateAppointmentFormData(
      form({ ...RECURRING_VISIT, recurrence_end_date: "2028-02-29" }),
    );

    assert.equal(
      result.success && result.data.recurrence_end_date,
      "2028-02-29",
    );
  });

  it("refuses an impossible end date under the end date field", () => {
    const result = parseCreateAppointmentFormData(
      form({ ...RECURRING_VISIT, recurrence_end_date: "2026-02-31" }),
    );

    assert.deepEqual(!result.success && result.fieldErrors, {
      recurrence_end_date: "Enter a valid end date.",
    });
  });

  it("refuses an end date before the appointment date", () => {
    const result = parseCreateAppointmentFormData(
      form({ ...RECURRING_VISIT, recurrence_end_date: "2026-03-09" }),
    );

    assert.deepEqual(!result.success && result.fieldErrors, {
      recurrence_end_date: "End date must be on or after the appointment date.",
    });
  });

  it("does not compare an end date against an impossible appointment date", () => {
    const result = parseCreateAppointmentFormData(
      form({
        ...RECURRING_VISIT,
        scheduled_date: "2026-04-31",
        recurrence_end_date: "2026-04-10",
      }),
    );

    assert.deepEqual(!result.success && result.fieldErrors, {
      scheduled_date: "Enter a valid date.",
    });
  });
});

describe("parseUpdateRecurrenceFormData", () => {
  const SERIES = {
    edit_scope: "future",
    recurrence_series_id: "series-1",
    recurrence_interval_count: "1",
    recurrence_interval_unit: "week",
  };

  it("accepts a normal end date", () => {
    const result = parseUpdateRecurrenceFormData(
      form({ ...SERIES, recurrence_end_date: "2026-06-30" }),
    );

    assert.equal(result.success, true);
    assert.equal(
      result.success && result.data.recurrence_end_date,
      "2026-06-30",
    );
  });

  it("accepts a leap-day end date", () => {
    const result = parseUpdateRecurrenceFormData(
      form({ ...SERIES, recurrence_end_date: "2028-02-29" }),
    );

    assert.equal(
      result.success && result.data.recurrence_end_date,
      "2028-02-29",
    );
  });

  it("refuses an impossible end date under the end date field", () => {
    const result = parseUpdateRecurrenceFormData(
      form({ ...SERIES, recurrence_end_date: "2026-02-31" }),
    );

    assert.equal(result.success, false);
    assert.deepEqual(!result.success && result.fieldErrors, {
      recurrence_end_date: "Enter a valid end date.",
    });
  });
});

const CAP_CASES = [
  ["day", 365],
  ["week", 52],
  ["month", 24],
] as const;

const recurrenceParsers = [
  [
    "parseCreateAppointmentFormData interval",
    (fields: Record<string, string | undefined>) =>
      parseCreateAppointmentFormData(form({ ...RECURRING_VISIT, ...fields })),
  ],
  [
    "parseUpdateRecurrenceFormData interval",
    (fields: Record<string, string | undefined>) =>
      parseUpdateRecurrenceFormData(
        form({
          edit_scope: "future",
          recurrence_series_id: "series-1",
          recurrence_interval_count: "1",
          recurrence_interval_unit: "week",
          ...fields,
        }),
      ),
  ],
] as const;

for (const [name, parse] of recurrenceParsers) {
  describe(name, () => {
    it("reads every 3 weeks as the interval", () => {
      const result = parse({
        recurrence_interval_count: "3",
        recurrence_interval_unit: "week",
      });

      assert.equal(result.success, true);
      assert.deepEqual(result.success && result.data.recurrence_interval, {
        unit: "week",
        count: 3,
      });
    });

    for (const [unit, cap] of CAP_CASES) {
      it(`accepts ${cap} ${unit}s, the cap`, () => {
        const result = parse({
          recurrence_interval_count: String(cap),
          recurrence_interval_unit: unit,
        });

        assert.deepEqual(result.success && result.data.recurrence_interval, {
          unit,
          count: cap,
        });
      });

      it(`refuses ${cap + 1} ${unit}s with the ${unit} cap in the message`, () => {
        const result = parse({
          recurrence_interval_count: String(cap + 1),
          recurrence_interval_unit: unit,
        });

        assert.deepEqual(!result.success && result.fieldErrors, {
          recurrence_interval_count: `Enter a whole number from 1 to ${cap}.`,
        });
      });
    }

    for (const [label, count] of [
      ["zero", "0"],
      ["a decimal", "1.5"],
      ["an empty count", ""],
      ["a negative count", "-2"],
      ["text", "abc"],
      ["exponent notation", "1e1"],
    ] as const) {
      it(`refuses ${label} under the count field`, () => {
        const result = parse({
          recurrence_interval_count: count,
          recurrence_interval_unit: "week",
        });

        assert.deepEqual(!result.success && result.fieldErrors, {
          recurrence_interval_count: "Enter a whole number from 1 to 52.",
        });
      });
    }

    it("refuses a missing count under the count field", () => {
      const result = parse({
        recurrence_interval_count: undefined,
        recurrence_interval_unit: "month",
      });

      assert.deepEqual(!result.success && result.fieldErrors, {
        recurrence_interval_count: "Enter a whole number from 1 to 24.",
      });
    });

    for (const unit of ["biweekly", "year", ""]) {
      it(`refuses the unit "${unit}" with only the unit error`, () => {
        const result = parse({
          recurrence_interval_count: "999",
          recurrence_interval_unit: unit,
        });

        assert.deepEqual(!result.success && result.fieldErrors, {
          recurrence_interval_unit: "Select a repeat unit.",
        });
      });
    }
  });
}

describe("interval outside the recurring scopes", () => {
  it("ignores the interval on a one-off create", () => {
    const result = parseCreateAppointmentFormData(
      form({
        ...VISIT,
        recurrence_interval_count: "0",
        recurrence_interval_unit: "biweekly",
      }),
    );

    assert.equal(result.success, true);
    assert.equal(result.success && result.data.recurrence_interval, null);
  });

  it("ignores the interval on an occurrence-scope edit", () => {
    const result = parseUpdateRecurrenceFormData(
      form({
        edit_scope: "occurrence",
        recurrence_interval_count: "0",
        recurrence_interval_unit: "biweekly",
      }),
    );

    assert.equal(result.success, true);
    assert.equal(result.success && result.data.recurrence_interval, null);
  });

  it("validates the interval on a series-scope edit", () => {
    const result = parseUpdateRecurrenceFormData(
      form({
        edit_scope: "series",
        recurrence_series_id: "series-1",
        recurrence_interval_count: "25",
        recurrence_interval_unit: "month",
      }),
    );

    assert.deepEqual(!result.success && result.fieldErrors, {
      recurrence_interval_count: "Enter a whole number from 1 to 24.",
    });
  });
});
