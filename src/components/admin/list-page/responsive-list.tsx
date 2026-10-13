"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import SortHeader from "@/components/admin/list-page/sort-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SortState } from "@/lib/admin/list-query";
import { cn } from "@/lib/utils";

export type ListColumn<T, K extends string = string> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  // Makes the header a SortHeader.
  sortKey?: K;
  align?: "start" | "end";
  // Cell classes (widths, truncation), appended after the kit's own.
  className?: string;
  // Exactly one column: its cell renders the row's real Link, the row's only
  // tab stop.
  isRowLink?: boolean;
};

export type ToolbarSize = "default" | "sm";

type ResponsiveListProps<T, K extends string> = {
  rows: T[];
  getKey: (row: T) => string;
  getHref: (row: T) => string;
  // Card content only: the kit's card is one Link, so no links or buttons.
  renderCard: (row: T) => React.ReactNode;
  columns: ListColumn<T, K>[];
  sort?: { state: SortState<K>; onSort: (column: K) => void };
  // Rendered twice: above the cards ("default") and in the table's toolbar
  // row ("sm"). The hidden copy is display:none, so live regions never double.
  toolbar: (size: ToolbarSize) => React.ReactNode;
  ariaLabel: string;
  isBusy?: boolean;
};

type Edge = { isFirst: boolean; isLast: boolean };

// Lines the first and last columns up with the toolbar's px-4.
function edgeClassName({ isFirst, isLast }: Edge): string {
  return cn(isFirst && "pl-4", isLast && "pr-4");
}

function ColumnHeader<T, K extends string>({
  column,
  edge,
  sort,
}: {
  column: ListColumn<T, K>;
  edge: Edge;
  sort: ResponsiveListProps<T, K>["sort"];
}): React.ReactNode {
  const isEnd = column.align === "end";
  const sortKey = column.sortKey;
  if (!sort || sortKey === undefined) {
    return (
      <TableHead className={cn(edgeClassName(edge), isEnd && "text-right")}>
        {column.header}
      </TableHead>
    );
  }

  const isActive = sort.state.sort === sortKey;
  return (
    <SortHeader
      label={column.header}
      activeDirection={isActive ? sort.state.direction : null}
      align={column.align}
      className={edgeClassName(edge)}
      onSort={() => sort.onSort(sortKey)}
    />
  );
}

// Overview list for admin pages: cards below xl, a table from xl. Callers
// render their own empty state instead of this when `rows` is empty.
export default function ResponsiveList<T, K extends string = string>({
  rows,
  getKey,
  getHref,
  renderCard,
  columns,
  sort,
  toolbar,
  ariaLabel,
  isBusy = false,
}: ResponsiveListProps<T, K>): React.ReactNode {
  const router = useRouter();
  const lastIndex = columns.length - 1;
  const edgeAt = (index: number): Edge => ({
    isFirst: index === 0,
    isLast: index === lastIndex,
  });

  return (
    <div
      aria-busy={isBusy}
      className={cn(
        "transition-opacity duration-fast",
        isBusy && "opacity-60",
      )}
    >
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3 xl:hidden">
        {toolbar("default")}
      </div>
      <ul aria-label={ariaLabel} className="space-y-3 xl:hidden">
        {rows.map((row) => (
          <li
            key={getKey(row)}
            className="rounded-lg bg-card ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-fast md:hover:ring-foreground/20"
          >
            <Link
              href={getHref(row)}
              className="block min-h-16 cursor-pointer rounded-lg p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
            >
              {renderCard(row)}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <div className="flex h-14 items-center justify-between gap-3 border-b px-4">
          {toolbar("sm")}
        </div>
        <Table className="text-sm" aria-label={ariaLabel}>
          <TableHeader>
            <TableRow className="h-10 hover:bg-transparent">
              {columns.map((column, index) => (
                <ColumnHeader
                  key={column.id}
                  column={column}
                  edge={edgeAt(index)}
                  sort={sort}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={getKey(row)}
                className="h-14 cursor-pointer"
                onClick={() => router.push(getHref(row))}
              >
                {columns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      edgeClassName(edgeAt(index)),
                      column.align === "end" && "text-right tabular-nums",
                      column.className,
                    )}
                  >
                    {column.isRowLink ? (
                      <Link
                        href={getHref(row)}
                        className="-mx-1 rounded-sm px-1 py-0.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
