"use client";

import { cn } from "@/lib/utils";

type SessionRowActionsProps = {
  layout: "row" | "card";
  children?: React.ReactNode;
};

// The shared slot for a session's action buttons, left to right: Acknowledge (outline), then the
// fix button, rightmost as the sometimes-primary action. Children gate themselves, so with none
// it collapses (`empty:hidden`).
export default function SessionRowActions({
  layout,
  children,
}: SessionRowActionsProps): React.ReactNode {
  return (
    <div
      className={cn(
        "flex gap-2 empty:hidden",
        layout === "row"
          ? "flex-nowrap justify-end"
          : "flex-wrap justify-start *:flex-1 sm:*:flex-none",
      )}
    >
      {children}
    </div>
  );
}
