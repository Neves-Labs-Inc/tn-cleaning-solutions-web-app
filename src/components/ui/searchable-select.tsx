'use client'

import { useState, type KeyboardEvent } from 'react'
import { ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

// cmdk ignores an empty value, so the "all" option needs a stand-in.
const EMPTY_OPTION_VALUE = '__empty__'

// Items are keyed by option value (labels can repeat), so match on the label keyword only.
function filterByLabel(_value: string, search: string, keywords: string[] = []): number {
  return keywords.some((keyword) => keyword.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0
}

type Option = {
  value: string
  label: string
}

type SearchableSelectProps = {
  options: Option[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedOption = options.find((option) => option.value === value)

  // Listbox convention: ArrowDown on a closed combobox opens it.
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' || open) return
    event.preventDefault()
    setOpen(true)
  }

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            id={id}
            role="combobox"
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            onKeyDown={handleTriggerKeyDown}
            // inline-size containment: a long label can't widen the trigger (or its grid/flex parent) past the container.
            className={cn(
              'h-(--control-height) w-full min-w-0 justify-between [contain:inline-size] rounded-md border-input bg-input/20 px-(--control-padding-x) text-base font-normal shadow-none transition-[background-color,box-shadow] duration-fast hover:bg-input/30 md:text-sm dark:bg-input/30',
              className
            )}
          />
        }
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', !selectedOption && 'text-muted-foreground')}>{selectedOption?.label || placeholder}</span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) max-w-(--available-width) min-w-64 p-0" align="start" side="bottom" sideOffset={4}>
        <Command filter={filterByLabel}>
          <CommandInput placeholder={searchPlaceholder} className="text-base md:text-xs" />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value || EMPTY_OPTION_VALUE}
                  keywords={[option.label]}
                  onSelect={() => handleSelect(option.value)}
                  className="min-h-11 text-base md:min-h-7 md:text-xs"
                  data-checked={value === option.value}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
