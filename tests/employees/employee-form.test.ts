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

describe("parseEmployeeUpdateFormData e-Transfer contact", () => {
  it("accepts an email or a phone number", () => {
    for (const contact of [
      "ana@example.com",
      "647-555-0142",
      "+1 (647) 555-0142",
      "16475550142",
    ]) {
      const result = parseEmployeeUpdateFormData(
        form({ full_name: "Ana", e_transfer_contact: contact }),
      );
      assert.equal(result.success, true, contact);
    }
  });

  it("stores an email lowercased and a phone number as typed", () => {
    const email = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", e_transfer_contact: " Ana@Example.com " }),
    );
    const phone = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", e_transfer_contact: " 647-555-0142 " }),
    );

    assert.equal(
      email.success && email.data.e_transfer_contact,
      "ana@example.com",
    );
    assert.equal(
      phone.success && phone.data.e_transfer_contact,
      "647-555-0142",
    );
  });

  it("refuses text that is neither an email nor a phone number", () => {
    for (const contact of [
      "abc",
      "555-0142",
      "1234567890123456",
      "647-555-0142 ext 2",
      "ana@example",
      "647--555--0142++",
    ]) {
      const result = parseEmployeeUpdateFormData(
        form({ full_name: "Ana", e_transfer_contact: contact }),
      );
      assert.equal(
        !result.success && result.fieldErrors.e_transfer_contact,
        "Enter an email or phone number.",
        contact,
      );
    }
  });

  it("reads a blank contact as null", () => {
    const result = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", e_transfer_contact: "  " }),
    );
    assert.equal(result.success && result.data.e_transfer_contact, null);
  });
});

describe("parseEmployeeUpdateFormData default Payout method", () => {
  it("keeps any free text, trimmed", () => {
    for (const [typed, stored] of [
      ["e-Transfer", "e-Transfer"],
      [" Cash ", "Cash"],
      ["Cheque to her mother", "Cheque to her mother"],
    ]) {
      const result = parseEmployeeUpdateFormData(
        form({ full_name: "Ana", default_payout_method: typed }),
      );
      assert.equal(result.success && result.data.default_payout_method, stored);
    }
  });

  it("clears to null when blank", () => {
    const result = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", default_payout_method: "   " }),
    );
    assert.equal(result.success && result.data.default_payout_method, null);
  });

  it("refuses more than 60 characters", () => {
    const result = parseEmployeeUpdateFormData(
      form({ full_name: "Ana", default_payout_method: "x".repeat(61) }),
    );
    assert.equal(
      !result.success && result.fieldErrors.default_payout_method,
      "Use 60 characters or fewer.",
    );
  });
});
