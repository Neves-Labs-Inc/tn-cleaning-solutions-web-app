"use client";

import { PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import type { SessionRowView } from "@/lib/time-sheets/drilldown-days";

type AcknowledgeButtonProps = {
  view: SessionRowView;
  isOpen: boolean;
  onOpen: () => void;
  layout: "row" | "card";
};

// Marks the button so the drill-down can return focus to the visible copy (card or table row).
export const ACKNOWLEDGE_BUTTON_ATTRIBUTE = "data-acknowledge-for";

export default function AcknowledgeButton({
  view,
  isOpen,
  onOpen,
  layout,
}: AcknowledgeButtonProps): React.ReactNode {
  if (!view.flags.includes("odd_duration")) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size={layout === "row" ? "sm" : "default"}
      aria-expanded={isOpen}
      {...{ [ACKNOWLEDGE_BUTTON_ATTRIBUTE]: view.id }}
      className={PRESS_CLASS_NAME}
      // Clicking again while open does nothing; Cancel closes the panel.
      onClick={isOpen ? undefined : onOpen}
    >
      Acknowledge
    </Button>
  );
}
