import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type ExpandChevronProps = {
  isOpen: boolean;
};

// Points right when closed and turns down when open.
export default function ExpandChevron({
  isOpen,
}: ExpandChevronProps): React.ReactNode {
  return (
    <ChevronRight
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out-quart",
        isOpen && "rotate-90",
      )}
      aria-hidden="true"
    />
  );
}
