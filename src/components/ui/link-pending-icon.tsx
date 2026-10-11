"use client";

import { useLinkStatus } from "next/link";

import { Spinner } from "@/components/ui/spinner";

type LinkPendingIconProps = {
  icon: React.ReactNode;
};

// Swaps an icon inside a Link for a spinner while that Link's navigation is pending. Must render
// inside the Link (useLinkStatus reads the nearest one).
export default function LinkPendingIcon({ icon }: LinkPendingIconProps): React.ReactNode {
  const { pending } = useLinkStatus();
  // The wrapper keeps the 20px icon slot, so the tile doesn't shift while pending.
  return pending ? (
    <span className="flex size-5 items-center justify-center">
      <Spinner className="size-4" />
    </span>
  ) : (
    icon
  );
}
