"use client";

import ListSearch from "@/components/admin/list-page/list-search";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { SortDirection } from "@/lib/admin/list-query";
import type {
  ClientSortKey,
  ClientStatusFilter,
  ClientsQuery,
} from "@/lib/clients/overview";

type ClientsFiltersProps = {
  query: ClientsQuery;
  onSearch: (search: string) => void;
  onChange: (patch: Partial<ClientsQuery>) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

const STATUS_OPTIONS: Array<{ value: ClientStatusFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All clients" },
];

type SortOption = {
  sort: ClientSortKey;
  direction: SortDirection;
  label: string;
};

const SORT_OPTIONS: SortOption[] = [
  { sort: "name", direction: "asc", label: "Name A–Z" },
  { sort: "name", direction: "desc", label: "Name Z–A" },
  // Short enough for the half-width select at 375px.
  { sort: "owed", direction: "desc", label: "Most owed" },
  { sort: "owed", direction: "asc", label: "Least owed" },
  { sort: "locations", direction: "desc", label: "Most locations" },
  { sort: "locations", direction: "asc", label: "Fewest locations" },
];

// One select carries both the column and its direction.
function sortValue(option: { sort: ClientSortKey; direction: SortDirection }): string {
  return `${option.sort}:${option.direction}`;
}

// The URL is the source of truth: the parent turns every change into a
// navigation. From xl the table's column headers sort, so Sort hides.
export default function ClientsFilters({
  query,
  onSearch,
  onChange,
  searchRef,
}: ClientsFiltersProps): React.ReactNode {
  function handleStatusChange(value: string): void {
    const option = STATUS_OPTIONS.find((status) => status.value === value);
    if (!option) return;

    onChange({ status: option.value });
  }

  function handleSortChange(value: string): void {
    const option = SORT_OPTIONS.find((sort) => sortValue(sort) === value);
    if (!option) return;

    onChange({ sort: option.sort, direction: option.direction });
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_12rem] md:items-center xl:grid-cols-[minmax(0,1fr)_12rem]">
      <ListSearch
        value={query.query}
        onChange={onSearch}
        placeholder="Search name, email or phone"
        ariaLabel="Search clients"
        inputRef={searchRef}
      />

      <div className="grid grid-cols-2 gap-2 md:contents">
        <NativeSelect
          aria-label="Status"
          className="w-full"
          value={query.status}
          onChange={(event) => handleStatusChange(event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Sort"
          className="w-full xl:hidden"
          value={sortValue(query)}
          onChange={(event) => handleSortChange(event.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <NativeSelectOption key={sortValue(option)} value={sortValue(option)}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
