'use client'

import { useState, type KeyboardEvent } from 'react'
import { ChevronsUpDown, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

// Items are keyed by option value (labels can repeat), so match on the label keyword only.
function filterByLabel(_value: string, search: string, keywords: string[] = []): number {
  return keywords.some((keyword) => keyword.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0
}

type Option = {
  value: string
  label: string
}

type SearchableMultiSelectProps = {
  options: Option[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  badgeClassName?: string
  id?: string
}

export function SearchableMultiSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  badgeClassName,
  id,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedOptions = options.filter((option) => value.includes(option.value))

  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((id) => id !== optionValue)
      : [...value, optionValue]
    onValueChange(newValue)
  }

  const removeOption = (optionValue: string) => {
    onValueChange(value.filter((id) => id !== optionValue))
  }

  // Listbox convention: ArrowDown on a closed combobox opens it.
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' || open) return
    event.preventDefault()
    setOpen(true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            id={id}
            role="combobox"
            aria-expanded={open}
            onKeyDown={handleTriggerKeyDown}
            // inline-size containment: long chips can't widen the trigger (or its grid/flex parent) past the container.
            className={cn(
              'h-auto min-h-(--control-height) w-full min-w-0 justify-start [contain:inline-size] rounded-md border-input bg-input/20 px-(--control-padding-x) py-1.5 text-base font-normal shadow-none transition-[background-color,box-shadow] duration-fast hover:bg-input/30 md:text-sm dark:bg-input/30',
              className
            )}
          />
        }
      >
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className={cn('max-w-full min-w-0 rounded-md px-2 text-xs font-medium', badgeClassName)}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {/* Mouse shortcut at md+ only: phones and keyboards toggle through the 44px popover rows,
                      and a nested tab stop inside the trigger button would be invalid. */}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${option.label}`}
                    className="-mr-1 ml-0.5 hidden size-5 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10 md:inline-flex"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeOption(option.value)
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </span>
                </Badge>
              ))}
            </>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </div>
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
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => toggleOption(option.value)}
                  className="min-h-11 text-base md:min-h-7 md:text-xs"
                  data-checked={value.includes(option.value)}
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
