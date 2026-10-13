'use client'

import ListSearch from '@/components/admin/list-page/list-search'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import type { ClientOption, InvoiceFilter } from '@/lib/invoices/view'

type InvoiceFiltersProps = {
  filter: InvoiceFilter
  clients: ClientOption[]
  onChange: (patch: Partial<InvoiceFilter>) => void
}

const STATUS_OPTIONS: Array<{ value: InvoiceFilter['status']; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

const ALL_CLIENTS_OPTION = { value: '', label: 'All clients' }

const SWITCH_ROW = 'min-h-11 cursor-pointer gap-2 text-sm'

// The URL is the source of truth: the parent turns every change into a navigation. Remount this
// (via `key`) to reset the search box after the parent clears the filters.
export default function InvoiceFilters({ filter, clients, onChange }: InvoiceFiltersProps): React.ReactNode {
  const clientOptions = [
    ALL_CLIENTS_OPTION,
    ...clients
      .map((client) => ({ value: client.id, label: client.name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
  ]

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_14rem] md:items-center xl:grid-cols-[minmax(0,1fr)_10rem_14rem_auto_auto]">
      <ListSearch
        value={filter.query}
        onChange={(query) => onChange({ query })}
        placeholder="Search number or client"
        ariaLabel="Search invoices"
      />

      <div className="grid grid-cols-2 gap-2 md:contents">
        <NativeSelect
          aria-label="Status"
          className="w-full"
          value={filter.status}
          onChange={(event) => onChange({ status: event.target.value as InvoiceFilter['status'] })}
        >
          {STATUS_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <SearchableSelect
          options={clientOptions}
          value={filter.clientId}
          onValueChange={(clientId) => onChange({ clientId })}
          placeholder="All clients"
          searchPlaceholder="Search clients…"
          emptyMessage="No clients found."
          aria-label="Client"
        />
      </div>

      <div className="flex flex-wrap gap-x-6 md:col-span-full xl:contents">
        <Label className={SWITCH_ROW}>
          <Switch checked={filter.automaticOnly} onCheckedChange={(checked) => onChange({ automaticOnly: checked })} />
          Automatic only
        </Label>
        <Label className={SWITCH_ROW}>
          <Switch checked={filter.showArchived} onCheckedChange={(checked) => onChange({ showArchived: checked })} />
          Show archived
        </Label>
      </div>
    </div>
  )
}
