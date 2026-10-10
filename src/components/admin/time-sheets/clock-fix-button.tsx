"use client";

import { PRESS_FEEDBACK } from "@/components/admin/time-sheets/clock-form-footer";
import { Button } from "@/components/ui/button";
import { FIX_LABELS, type ClockFixView } from "@/hooks/use-clock-correction";
import { cn } from "@/lib/utils";

type ClockFixButtonProps = {
  view: Pick<ClockFixView, "fixAction" | "flags">;
  layout: "row" | "card";
  // Where focus returns when the panel closes.
  id: string;
  expanded: boolean;
  controlsId: string;
  onOpen: () => void;
};

export default function ClockFixButton({
  view,
  layout,
  id,
  expanded,
  controlsId,
  onOpen,
}: ClockFixButtonProps): React.ReactNode {
  const { fixAction } = view;
  if (fixAction === null) return null;

  // A flagged session still missing clocks is the next step; an edit never is.
  const isUrgent = view.flags.length > 0 && fixAction !== "edit";
  return (
    <Button
      id={id}
      type="button"
      variant={isUrgent ? "default" : "outline"}
      size={layout === "row" ? "sm" : "default"}
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onOpen}
      className={cn(
        PRESS_FEEDBACK,
        isUrgent ? "md:hover:bg-primary/90" : "active:bg-muted md:hover:bg-muted",
        layout === "card" && "flex-1 sm:flex-none",
      )}
    >
      {FIX_LABELS[fixAction]}
    </Button>
  );
}
