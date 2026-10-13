import { ArrowUp, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/admin/list-query";
import { cn } from "@/lib/utils";

type SortHeaderProps = {
  label: string;
  // The column's direction when it is the active sort, else null.
  activeDirection: SortDirection | null;
  align?: "start" | "end";
  className?: string;
  onSort: () => void;
};

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

export default function SortHeader({
  label,
  activeDirection,
  align = "start",
  className,
  onSort,
}: SortHeaderProps): React.ReactNode {
  const isEnd = align === "end";

  return (
    <TableHead
      aria-sort={activeDirection ? ARIA_SORT[activeDirection] : undefined}
      className={cn(isEnd && "text-right", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={isEnd ? "-mr-3 justify-end" : "-ml-3"}
        onClick={onSort}
      >
        {label}
        {activeDirection ? (
          <ArrowUp
            aria-hidden="true"
            className={cn(
              "size-3.5 text-foreground transition-transform duration-base ease-out-quart",
              activeDirection === "desc" && "rotate-180",
            )}
          />
        ) : (
          <ArrowUpDown
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
        )}
      </Button>
    </TableHead>
  );
}
