import type { ListColumn } from "@/components/admin/list-page/responsive-list";
import StatusBadge, {
  activeStateBadge,
  ARCHIVED_BADGE,
  type StatusBadgeSpec,
} from "@/components/ui/status-badge";
import type { ClientOverviewRow, ClientSortKey } from "@/lib/clients/overview";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

// Archived wins: an archived client's Active flag no longer matters.
function clientStatusBadge(row: ClientOverviewRow): StatusBadgeSpec {
  return row.is_archived ? ARCHIVED_BADGE : activeStateBadge(row.is_active);
}

function ClientStatusBadge({ row }: { row: ClientOverviewRow }): React.ReactNode {
  const badge = clientStatusBadge(row);
  return (
    <StatusBadge tone={badge.tone} icon={badge.icon}>
      {badge.label}
    </StatusBadge>
  );
}

function OwedValue({
  cents,
  className,
}: {
  cents: number | null;
  className?: string;
}): React.ReactNode {
  if (cents === null) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Balance unavailable</span>
      </span>
    );
  }

  // Weight, not colour, makes debtors stand out.
  return (
    <span
      className={cn(
        "tabular-nums",
        cents > 0
          ? "font-semibold text-foreground"
          : "font-normal text-muted-foreground",
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

function Missing(): React.ReactNode {
  return <span className="text-muted-foreground">—</span>;
}

function locationLabel(count: number): string {
  return `${count} ${count === 1 ? "location" : "locations"}`;
}

export function renderClientCard(row: ClientOverviewRow): React.ReactNode {
  const contact = row.email ?? row.phone;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold break-words">
          {row.name}
        </p>
        <OwedValue cents={row.owed_cents} className="shrink-0" />
      </div>
      {contact ? (
        <p className="truncate text-sm text-muted-foreground">{contact}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ClientStatusBadge row={row} />
        <span className="text-xs text-muted-foreground">
          · {locationLabel(row.location_count)}
        </span>
      </div>
    </>
  );
}

export const CLIENT_COLUMNS: ListColumn<ClientOverviewRow, ClientSortKey>[] = [
  {
    id: "client",
    header: "Client",
    sortKey: "name",
    isRowLink: true,
    // The table cell doesn't wrap, so a long name would widen the table.
    cell: (row) => (
      <span className="inline-block max-w-64 truncate align-middle" title={row.name}>
        {row.name}
      </span>
    ),
  },
  {
    id: "email",
    header: "Email",
    cell: (row) =>
      row.email ? (
        <span className="block max-w-56 truncate">{row.email}</span>
      ) : (
        <Missing />
      ),
  },
  {
    id: "phone",
    header: "Phone",
    className: "whitespace-nowrap tabular-nums",
    cell: (row) => row.phone ?? <Missing />,
  },
  {
    id: "locations",
    header: "Locations",
    sortKey: "locations",
    align: "end",
    cell: (row) => row.location_count,
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => <ClientStatusBadge row={row} />,
  },
  {
    id: "owed",
    header: "Owed",
    sortKey: "owed",
    align: "end",
    cell: (row) => <OwedValue cents={row.owed_cents} />,
  },
];
