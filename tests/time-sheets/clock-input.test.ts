import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isInstantOrNull } from "../../src/lib/time-sheets/clock-input.ts";

describe("isInstantOrNull", () => {
  it("accepts null and real instants, leap day included", () => {
    assert.equal(isInstantOrNull(null), true);
    assert.equal(isInstantOrNull("2028-02-29T15:00:00.000Z"), true);
    assert.equal(isInstantOrNull("2026-10-13T14:30:00.000Z"), true);
  });

  it("accepts database round-trips and offsets", () => {
    assert.equal(isInstantOrNull("2026-10-14T13:05:30.123456+00:00"), true);
    assert.equal(isInstantOrNull("2026-10-14T09:05:30-04:00"), true);
  });

  it("rejects lenient non-ISO and zone-less forms", () => {
    assert.equal(isInstantOrNull("2026-02-28 junk"), false);
    assert.equal(isInstantOrNull("2026-02-28 10:00"), false);
    assert.equal(isInstantOrNull("2026-02-28T10:00:00"), false);
  });

  it("rejects an instant on a day that does not exist", () => {
    assert.equal(isInstantOrNull("2026-02-31T10:00:00.000Z"), false);
  });

  it("rejects an impossible hour", () => {
    assert.equal(isInstantOrNull("2026-02-28T25:00:00Z"), false);
  });

  it("rejects unparseable strings and non-strings", () => {
    assert.equal(isInstantOrNull("garbage"), false);
    assert.equal(isInstantOrNull(""), false);
    assert.equal(isInstantOrNull(123), false);
    assert.equal(isInstantOrNull(undefined), false);
  });
});
