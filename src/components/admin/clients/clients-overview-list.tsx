"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import {
  CLIENT_COLUMNS,
  renderClientCard,
} from "@/components/admin/clients/client-columns";
import ClientsFilters from "@/components/admin/clients/clients-filters";
import ClientsLoadError from "@/components/admin/clients/clients-load-error";
import FilteredEmpty from "@/components/admin/list-page/filtered-empty";
import ListCountBar from "@/components/admin/list-page/list-count-bar";
import ResponsiveList from "@/components/admin/list-page/responsive-list";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useListNavigation } from "@/hooks/use-list-navigation";
import { nextSort } from "@/lib/admin/list-query";
import {
  CLIENT_SORT_COLUMNS,
  clientsQueryToSearchParams,
  isClientsFilterActive,
  type ClientOverviewRow,
  type ClientsQuery,
} from "@/lib/clients/overview";

type ClientsOverviewListProps = {
  // Already filtered and sorted for `query`.
  rows: ClientOverviewRow[];
  hasClients: boolean;
  query: ClientsQuery;
  isOwedUnavailable: boolean;
};

const CLIENTS_PATH = "/solutions/clients";

function NoClients(): React.ReactNode {
  return (
    <Empty className="rounded-lg border animate-in fade-in-0 duration-base ease-out-quart">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Users aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No clients yet</EmptyTitle>
        <EmptyDescription>
          Add your first client to begin scheduling work and assigning
          locations.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          render={<Link href={`${CLIENTS_PATH}/new`} />}
          nativeButton={false}
        >
          New client
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export default function ClientsOverviewList({
  rows,
  hasClients,
  query,
  isOwedUnavailable,
}: ClientsOverviewListProps): React.ReactNode {
  const navigation = useListNavigation(query, clientsQueryToSearchParams);
  const current = navigation.query;
  const searchRef = useRef<HTMLInputElement>(null);
  const [clearCount, setClearCount] = useState(0);

  // Focus after the remount, so it lands on the fresh search box.
  useEffect(() => {
    if (clearCount > 0) searchRef.current?.focus();
  }, [clearCount]);

  function handleClear(): void {
    setClearCount((count) => count + 1);
    navigation.push({ ...current, query: "", status: "active" });
  }

  function handleSort(column: ClientsQuery["sort"]): void {
    navigation.push({
      ...current,
      ...nextSort(current, column, CLIENT_SORT_COLUMNS),
    });
  }

  function renderList(): React.ReactNode {
    if (!hasClients) return <NoClients />;
    if (rows.length === 0) {
      return (
        <FilteredEmpty
          title="No clients match"
          description="Try a different search or status."
          onClear={handleClear}
        />
      );
    }

    return (
      <ResponsiveList
        rows={rows}
        getKey={(row) => row.id}
        getHref={(row) => `${CLIENTS_PATH}/${row.id}`}
        renderCard={renderClientCard}
        columns={CLIENT_COLUMNS}
        sort={{ state: current, onSort: handleSort }}
        toolbar={(size) => (
          <ListCountBar
            size={size}
            count={rows.length}
            noun={["client", "clients"]}
            showClear={isClientsFilterActive(current)}
            onClear={handleClear}
          />
        )}
        ariaLabel="Clients"
        isBusy={navigation.isNavigating}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ClientsFilters
        key={clearCount}
        query={current}
        searchRef={searchRef}
        onSearch={(search) => navigation.replace({ ...current, query: search })}
        onChange={(patch) => navigation.push({ ...current, ...patch })}
      />
      {isOwedUnavailable ? (
        <ClientsLoadError
          title="Couldn't load balances"
          description="Clients are fine; Owed shows — until balances load."
        />
      ) : null}
      {renderList()}
    </div>
  );
}
