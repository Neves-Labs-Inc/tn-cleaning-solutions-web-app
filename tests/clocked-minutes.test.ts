import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getClockedMinutes } from "../src/lib/clocked-minutes.ts";

describe("getClockedMinutes", () => {
  it("drops seconds from both clocks before subtracting", () => {
    assert.equal(
      getClockedMinutes("2026-10-14T13:00:40Z", "2026-10-14T16:30:10Z"),
      210,
    );
  });

  it("gives the same answer for clocks on the minute", () => {
    assert.equal(
      getClockedMinutes("2026-10-14T13:00:00Z", "2026-10-14T16:30:00Z"),
      210,
    );
  });

  it("counts a minute boundary crossed in under a minute", () => {
    assert.equal(
      getClockedMinutes("2026-10-14T09:00:50Z", "2026-10-14T09:01:10Z"),
      1,
    );
  });

  it("handles sub-second precision", () => {
    assert.equal(
      getClockedMinutes(
        "2026-10-14T13:00:59.123456+00:00",
        "2026-10-14T13:30:00.999999+00:00",
      ),
      30,
    );
  });

  it("handles mixed offsets", () => {
    // 10:30:10-04:00 is 14:30:10Z, so 13:00 to 14:30 by the displayed minutes.
    assert.equal(
      getClockedMinutes("2026-10-14T13:00:30Z", "2026-10-14T10:30:10-04:00"),
      90,
    );
  });

  it("gives 0 when clock-out is before clock-in", () => {
    assert.equal(
      getClockedMinutes("2026-10-14T09:00:00Z", "2026-10-14T08:00:00Z"),
      0,
    );
  });
});
