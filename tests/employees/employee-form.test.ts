import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseEmployeeUpdateFormData } from "../../src/lib/employees/employee-form.ts";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

describe("parseEmployeeUpdateFormData", () => {
  it("refuses an impossible started_at under that field", () => {
    const result = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", started_at: "2026-02-31" }),
    );

    assert.equal(result.success, false);
    assert.equal(
      !result.success && result.fieldErrors.started_at,
      "Enter a valid date.",
    );
  });

  it("accepts a leap day and a normal date", () => {
    for (const startedAt of ["2028-02-29", "2026-10-13"]) {
      const result = parseEmployeeUpdateFormData(
        form({ full_name: "Ana", started_at: startedAt }),
      );
      assert.equal(result.success && result.data.started_at, startedAt);
    }
  });

  it("reads a blank started_at as null", () => {
    const result = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", started_at: "" }),
    );
    assert.equal(result.success && result.data.started_at, null);
  });
});
