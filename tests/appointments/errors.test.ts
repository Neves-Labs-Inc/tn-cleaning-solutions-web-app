import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { toAppointmentErrorMessage } from "../../src/lib/appointments/errors.ts";

const GENERIC_MESSAGE = "Something went wrong. Try again.";

function silenceConsoleError(t: TestContext) {
  return t.mock.method(console, "error", () => {});
}

describe("toAppointmentErrorMessage", () => {
  it("passes a trigger refusal (P0001) through verbatim", (t) => {
    const logged = silenceConsoleError(t);
    const refusal = {
      code: "P0001",
      message: "This visit is on a paid invoice. Void the invoice first.",
    };

    assert.equal(
      toAppointmentErrorMessage(refusal, "cancelAppointment"),
      "This visit is on a paid invoice. Void the invoice first.",
    );
    assert.equal(logged.mock.callCount(), 0);
  });

  for (const code of ["23505", "42501", "PGRST116", "PGRST301"]) {
    it(`hides the raw message of a ${code} error`, (t) => {
      silenceConsoleError(t);
      const error = { code, message: `raw ${code} detail from postgres` };

      assert.equal(
        toAppointmentErrorMessage(error, "updateAppointment"),
        GENERIC_MESSAGE,
      );
    });
  }

  it("hides the raw message of an error with no code", (t) => {
    silenceConsoleError(t);

    assert.equal(
      toAppointmentErrorMessage(
        { message: "fetch failed" },
        "createAppointment",
      ),
      GENERIC_MESSAGE,
    );
  });

  it("logs a hidden error's operation, code and message, never its details", (t) => {
    const logged = silenceConsoleError(t);
    const error = {
      code: "23505",
      message: "duplicate key value",
      details: "Key (name)=(Jane Smith) already exists.",
    };

    toAppointmentErrorMessage(error, "createAppointment");

    assert.equal(logged.mock.callCount(), 1);
    const [label, loggedError] = logged.mock.calls[0].arguments;
    assert.match(String(label), /createAppointment/);
    assert.deepEqual(loggedError, {
      code: "23505",
      message: "duplicate key value",
    });
  });
});
