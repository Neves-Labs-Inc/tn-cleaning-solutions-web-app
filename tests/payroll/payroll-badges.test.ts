import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  FileCheck2,
  Lock,
  Pencil,
} from "lucide-react";

import {
  BLOCKED_BADGE,
  FLAG_COUNT_BADGE,
  NO_PAY_RATE_BADGE,
  OFF_CYCLE_BADGE,
  PAY_PERIOD_STATUS_BADGES,
  PAY_RUN_STATUS_BADGES,
  UNPAID_AFTER_FINALIZE_BADGE,
} from "../../src/components/ui/status-badge-tones.ts";

// The tone and icon of every Payroll pill, as DESIGN.md §3.2 maps them.
describe("Payroll badge specs", () => {
  it("paints each Pay period status", () => {
    assert.deepEqual(PAY_PERIOD_STATUS_BADGES, {
      running: { tone: "progress", label: "Running", icon: Clock },
      ready_to_review: {
        tone: "warning",
        label: "Ready to review",
        icon: CircleDashed,
      },
      to_pay: { tone: "info", label: "Finalized · to pay", icon: FileCheck2 },
      paid: { tone: "success", label: "Paid", icon: CheckCircle2 },
      no_pay: { tone: "neutral", label: "No pay" },
    });
  });

  it("paints each Pay run status", () => {
    assert.deepEqual(PAY_RUN_STATUS_BADGES, {
      draft: { tone: "neutral", label: "Draft", icon: Pencil },
      finalized: { tone: "info", label: "Finalized", icon: FileCheck2 },
      paid: { tone: "success", label: "Paid", icon: CheckCircle2 },
    });
  });

  it("paints the run and line markers", () => {
    assert.deepEqual(OFF_CYCLE_BADGE, { tone: "progress", label: "Off-cycle" });
    assert.deepEqual(BLOCKED_BADGE, {
      tone: "danger",
      label: "Blocked",
      icon: Lock,
    });
    assert.deepEqual(FLAG_COUNT_BADGE, {
      tone: "warning",
      label: "Flags",
      icon: AlertTriangle,
    });
    assert.deepEqual(UNPAID_AFTER_FINALIZE_BADGE, {
      tone: "danger",
      label: "Unpaid shift after finalize",
      icon: AlertTriangle,
    });
    assert.deepEqual(NO_PAY_RATE_BADGE, {
      tone: "danger",
      label: "No Pay rate",
      icon: CircleSlash,
    });
  });
});
