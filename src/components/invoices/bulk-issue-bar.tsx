'use client'

import { useId } from 'react'
import { AlertCircle, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import type { BulkIssue } from '@/hooks/use-bulk-issue'
import type { DraftSelection } from '@/hooks/use-draft-selection'
import { BULK_ISSUE_LIMIT } from '@/lib/invoices/view'
import { cn } from '@/lib/utils'

type BulkIssueBarProps = {
  placement: 'fixed-bottom' | 'table-toolbar'
  bulk: BulkIssue
  selection: DraftSelection
  selectableCount: number
  unpricedSelectedCount: number
  businessDate: string
}

const DATE_HINT = 'Leave blank and it never goes overdue.'

function countText(selected: number, selectable: number): string {
  return `${selected} of ${selectable} ${selectable === 1 ? 'draft' : 'drafts'} selected`
}

function unpricedText(count: number): string {
  const subject = count === 1 ? 'draft has' : 'drafts have'
  return `${count} selected ${subject} an Unpriced line and will be skipped.`
}

function submitLabel(count: number): string {
  return `Issue ${count} ${count === 1 ? 'draft' : 'drafts'}`
}

export default function BulkIssueBar({
  placement,
  bulk,
  selection,
  selectableCount,
  unpricedSelectedCount,
  businessDate,
}: BulkIssueBarProps): React.ReactNode {
  const dateId = useId()
  const hintId = useId()
  const isOpen = selection.selectedCount > 0
  const isTable = placement === 'table-toolbar'
  // The phone bar's controls must reach 44px (the default size); the table toolbar can be compact.
  const controlSize = isTable ? 'sm' : 'default'

  const selectionControls = (
    <>
      {selection.isAllSelected ? null : (
        <Button
          type="button"
          variant="ghost"
          size={controlSize}
          disabled={bulk.isPending}
          onClick={selection.selectAll}
          className="md:hover:bg-muted"
        >
          Select all
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size={controlSize}
        disabled={bulk.isPending}
        onClick={selection.clear}
        className="md:hover:bg-muted"
      >
        Clear
      </Button>
    </>
  )

  const dateInput = (
    <Input
      id={dateId}
      type="date"
      name="due_date"
      value={bulk.dueDate}
      min={businessDate}
      disabled={bulk.isPending}
      aria-invalid={bulk.isDueDateInvalid || undefined}
      aria-describedby={hintId}
      onChange={(event) => bulk.changeDueDate(event.target.value)}
    />
  )

  const submit = (
    <SubmitButton
      label={submitLabel(selection.selectedCount)}
      pendingLabel="Issuing…"
      className="min-w-36 active:scale-[0.98]"
    />
  )

  const captionText =
    unpricedSelectedCount > 0
      ? unpricedText(unpricedSelectedCount)
      : selection.isCapped && selection.selectedCount >= BULK_ISSUE_LIMIT
        ? `Up to ${BULK_ISSUE_LIMIT} drafts can be issued at once.`
        : null

  const caption = captionText ? (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{captionText}</span>
    </p>
  ) : null

  const error = bulk.error ? (
    <p role="alert" className="flex min-w-0 items-center gap-1.5 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{bulk.error}</span>
    </p>
  ) : null

  if (isTable) {
    return (
      <form
        action={() => bulk.issue(selection.selectedIds)}
        inert={!isOpen}
        className={cn(
          'flex items-center justify-between gap-3 px-4 transition-opacity duration-fast [grid-area:1/1]',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <p className="mr-2 text-sm font-medium whitespace-nowrap">{countText(selection.selectedCount, selectableCount)}</p>
            {selectionControls}
          </div>
          {error ?? caption ?? <p className="truncate text-xs text-muted-foreground">{DATE_HINT}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={dateId} className="text-sm font-medium">
            Due date (optional)
          </label>
          <div className="w-40">{dateInput}</div>
          {submit}
        </div>
        <span id={hintId} className="sr-only">
          {DATE_HINT}
        </span>
      </form>
    )
  }

  // From lg the admin sidebar (w-68) is visible, so the bar starts at its edge instead of covering it.
  return (
    <div
      inert={!isOpen}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur transition-[translate,opacity] lg:left-68 xl:hidden',
        isOpen
          ? 'translate-y-0 opacity-100 duration-base ease-out-quart'
          : 'pointer-events-none translate-y-full opacity-0 duration-[140ms] ease-in-quart',
      )}
    >
      <form action={() => bulk.issue(selection.selectedIds)} className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{countText(selection.selectedCount, selectableCount)}</p>
          <div className="flex items-center">{selectionControls}</div>
        </div>
        {caption}
        {error}
        <Field>
          <FieldLabel htmlFor={dateId}>Due date (optional)</FieldLabel>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            {dateInput}
            {submit}
          </div>
          <FieldDescription id={hintId}>{DATE_HINT}</FieldDescription>
        </Field>
      </form>
    </div>
  )
}
