import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseCreateAppointmentFormData,
  parseUpdateAppointmentFormData,
  parseUpdateRecurrenceFormData,
} from "../../src/lib/appointments/appointment-form.ts";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
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
  recurrence_frequency: "weekly",
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
    recurrence_frequency: "weekly",
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
