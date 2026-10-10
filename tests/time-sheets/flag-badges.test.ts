import assert from "node:assert/strict";
import { test } from "node:test";

import { CheckCircle2, CircleDashed, Clock, Hourglass, Pencil } from "lucide-react";

import { timeSheetFlagBadges } from "../../src/components/ui/status-badge-tones.ts";

type BadgeInput = Parameters<typeof timeSheetFlagBadges>[0];

const BASE: BadgeInput = {
  state: "closed",
  flags: [],
  oddRatioPercent: 100,
  isAcknowledged: false,
  isManualCompletion: false,
  isEdited: false,
  fixAction: null,
};

test("a plain closed session wears no badges", () => {
  assert.deepEqual(timeSheetFlagBadges(BASE), []);
});

test("an open shift is a warning with a clock icon", () => {
  const badges = timeSheetFlagBadges({ ...BASE, state: "open", flags: ["open_shift"] });

  assert.deepEqual(badges, [{ tone: "warning", label: "Open shift", icon: Clock }]);
});

test("a missing clock is danger with a dashed circle", () => {
  const badges = timeSheetFlagBadges({ ...BASE, state: "not_clocked", flags: ["missing_clock"] });

  assert.deepEqual(badges, [{ tone: "danger", label: "Missing clock", icon: CircleDashed }]);
});

test("an odd duration shows its percentage as a warning", () => {
  const badges = timeSheetFlagBadges({ ...BASE, flags: ["odd_duration"], oddRatioPercent: 42 });

  assert.deepEqual(badges, [{ tone: "warning", label: "Odd duration · 42%", icon: Hourglass }]);
});

test("in progress is success and upcoming is info", () => {
  assert.deepEqual(timeSheetFlagBadges({ ...BASE, state: "in_progress" }), [
    { tone: "success", label: "In progress" },
  ]);
  assert.deepEqual(timeSheetFlagBadges({ ...BASE, state: "upcoming" }), [
    { tone: "info", label: "Upcoming" },
  ]);
});

test("an unclocked session past its scheduled start reads Not clocked in, not Upcoming", () => {
  // The shared module offers Add session exactly once the scheduled start has passed.
  const badges = timeSheetFlagBadges({ ...BASE, state: "upcoming", fixAction: "add" });

  assert.deepEqual(badges, [{ tone: "info", label: "Not clocked in" }]);
});

test("an acknowledged odd duration is a neutral OK'd badge", () => {
  const badges = timeSheetFlagBadges({ ...BASE, isAcknowledged: true });

  assert.deepEqual(badges, [{ tone: "neutral", label: "Odd duration · OK'd", icon: CheckCircle2 }]);
});

test("Manual completion and Edited are neutral, Edited with a pencil", () => {
  const badges = timeSheetFlagBadges({ ...BASE, isManualCompletion: true, isEdited: true });

  assert.deepEqual(badges, [
    { tone: "neutral", label: "Manual completion" },
    { tone: "neutral", label: "Edited", icon: Pencil },
  ]);
});

test("flags come first, then state, acknowledgement, Manual completion and Edited", () => {
  const missing = timeSheetFlagBadges({
    ...BASE,
    state: "not_clocked",
    flags: ["missing_clock"],
    isManualCompletion: true,
    isEdited: true,
  });
  const inProgress = timeSheetFlagBadges({ ...BASE, state: "in_progress", isEdited: true });
  const acknowledged = timeSheetFlagBadges({
    ...BASE,
    isAcknowledged: true,
    isManualCompletion: true,
    isEdited: true,
  });

  assert.deepEqual(
    missing.map((badge) => badge.label),
    ["Missing clock", "Manual completion", "Edited"],
  );
  assert.deepEqual(
    inProgress.map((badge) => badge.label),
    ["In progress", "Edited"],
  );
  assert.deepEqual(
    acknowledged.map((badge) => badge.label),
    ["Odd duration · OK'd", "Manual completion", "Edited"],
  );
});
