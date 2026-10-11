import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeCompletion,
  getCompletionConfirmTitle,
  getSelectAll,
  toggleSelectAll,
} from "../../src/lib/appointments/needs-completion-view.ts";

describe("getSelectAll", () => {
  it("offers to select every row when none is checked", () => {
    assert.deepEqual(getSelectAll(0, 9), {
      state: "none",
      label: "Select all 9",
    });
  });

  it("counts the checked rows when some are", () => {
    assert.deepEqual(getSelectAll(3, 9), {
      state: "some",
      label: "3 of 9 selected",
    });
  });

  it("reads as all checked when every row is", () => {
    assert.deepEqual(getSelectAll(9, 9), {
      state: "all",
      label: "9 of 9 selected",
    });
  });
});

describe("toggleSelectAll", () => {
  const ids = ["a", "b", "c"];

  it("selects every row when none or some are checked", () => {
    assert.deepEqual(toggleSelectAll(ids, []), ["a", "b", "c"]);
    assert.deepEqual(toggleSelectAll(ids, ["b"]), ["a", "b", "c"]);
  });

  it("clears the selection when every row is checked", () => {
    assert.deepEqual(toggleSelectAll(ids, ["c", "a", "b"]), []);
  });
});

describe("getCompletionConfirmTitle", () => {
  it("names how many appointments will be marked", () => {
    assert.equal(
      getCompletionConfirmTitle(3),
      "Mark 3 appointments complete?",
    );
    assert.equal(getCompletionConfirmTitle(1), "Mark 1 appointment complete?");
  });
});

describe("describeCompletion", () => {
  it("reports the completed count when nothing was skipped", () => {
    assert.deepEqual(describeCompletion({ completed: 4, skipped: 0, failed: 0 }), {
      isSuccess: true,
      message: "Marked 4 complete.",
    });
  });

  it("adds the skipped ones when some changed in the meantime", () => {
    assert.deepEqual(describeCompletion({ completed: 4, skipped: 2, failed: 0 }), {
      isSuccess: true,
      message:
        "Marked 4 complete. 2 skipped because they changed. Refresh to see them.",
    });
    assert.equal(
      describeCompletion({ completed: 1, skipped: 1, failed: 0 }).message,
      "Marked 1 complete. 1 skipped because it changed. Refresh to see it.",
    );
  });

  it("names the ones it couldn't reach when the connection dropped partway", () => {
    assert.deepEqual(
      describeCompletion({ completed: 100, skipped: 0, failed: 150 }),
      {
        isSuccess: false,
        message:
          "Marked 100 complete. 150 couldn't be marked, still selected. Try again.",
      },
    );
    assert.equal(
      describeCompletion({ completed: 100, skipped: 2, failed: 1 }).message,
      "Marked 100 complete. 2 skipped because they changed. Refresh to see them. 1 couldn't be marked, still selected. Try again.",
    );
  });

    it("fails when every selected appointment changed", () => {
    assert.deepEqual(describeCompletion({ completed: 0, skipped: 3, failed: 0 }), {
      isSuccess: false,
      message:
        "Nothing was marked complete. They all changed. Refresh to see them.",
    });
  });
});
