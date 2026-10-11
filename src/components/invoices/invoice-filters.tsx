'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
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

const SEARCH_DEBOUNCE_MS = 300

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
  const [query, setQuery] = useState(filter.query)
  const [urlQuery, setUrlQuery] = useState(filter.query)
  // Follow the URL when `q` changes from outside (a sidebar link, back/forward). Our own pushes
  // already match the box, so typing is never overwritten.
  if (filter.query !== urlQuery) {
    setUrlQuery(filter.query)
    if (filter.query !== query.trim()) setQuery(filter.query)
  }

  const clientOptions = [
    ALL_CLIENTS_OPTION,
    ...clients
      .map((client) => ({ value: client.id, label: client.name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
  ]

  const searchRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The debounce timer fires renders later; it must call the parent's latest onChange.
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function pushQuery(value: string): void {
    if (timerRef.current) clearTimeout(timerRef.current)
    onChangeRef.current({ query: value.trim() })
  }

  function handleQueryChange(value: string): void {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => pushQuery(value), SEARCH_DEBOUNCE_MS)
  }

  function handleClearQuery(): void {
    setQuery('')
    pushQuery('')
    searchRef.current?.focus()
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_14rem] md:items-center xl:grid-cols-[minmax(0,1fr)_10rem_14rem_auto_auto]">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          pushQuery(query)
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search number or client"
            aria-label="Search invoices"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            className="[&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <InputGroupAddon align="inline-end">
              <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label="Clear search" onClick={handleClearQuery}>
                <X aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </form>

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
