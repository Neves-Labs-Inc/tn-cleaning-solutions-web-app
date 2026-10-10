'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useMemo, useState, useTransition } from 'react'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import SubmitButton from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { createInvoice } from '@/lib/actions/invoices'
import { claimableStates, defaultSelectedIds, draftTotalCents } from '@/lib/invoices/lines'
import type { BillableClient, ClaimableVisit } from '@/lib/invoices/queries'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import { ClaimableVisitList } from './claimable-visit-list'

const NEW_INVOICE_PATH = '/solutions/invoices/new'
const INVOICES_PATH = '/solutions/invoices'
const UNKNOWN_MESSAGE = 'Something went wrong. Try again.'
const STALE_VISIT_CODES = ['visit_claimed', 'visit_cancelled']
const CLIENT_FIELD_ID = 'invoice-client'
const CLIENT_ERROR_ID = 'invoice-client-error'

type CreateInvoiceFormProps = {
  clients: BillableClient[]
  // '' when no client is picked (or the one in the URL has nothing to bill).
  clientId: string
  visits: ClaimableVisit[]
  businessDate: string
  // ?client= named a client that isn't in the list.
  isClientUnavailable: boolean
}


function clientLabel(client: BillableClient): string {
  if (client.is_archived) return `${client.name} (archived)`
  return client.is_active ? client.name : `${client.name} (inactive)`
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function UnpricedNote({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null

  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-sm text-status-warning-foreground animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart',
        className
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {pluralize(count, 'Unpriced visit')}: set a price before issuing.
    </p>
  )
}

export function CreateInvoiceForm({ clients, clientId, visits, businessDate, isClientUnavailable }: CreateInvoiceFormProps) {
  const router = useRouter()
  const [isSwitching, startSwitch] = useTransition()

  // What the picker shows right away; the URL catches up when the transition lands.
  const [pickedId, setPickedId] = useState(clientId)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => defaultSelectedIds(visits, businessDate))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [clientError, setClientError] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  // Stays true after success so the form remains locked until the detail page takes over.
  const [hasCreated, setHasCreated] = useState(false)
  const [synced, setSynced] = useState({ clientId, visits })

  // A new client resets the checks to its defaults. The same client reloaded (after a refusal) keeps
  // the admin's checks, minus visits that left the list.
  if (synced.visits !== visits || synced.clientId !== clientId) {
    const isNewClient = synced.clientId !== clientId
    setSynced({ clientId, visits })
    setPickedId(clientId)
    // A refusal belongs to the client it was raised for, and to a list that is still shown.
    if (isNewClient || clientId === '') {
      setRefusal(null)
    }
    setSelected(
      isNewClient
        ? defaultSelectedIds(visits, businessDate)
        : new Set(visits.filter((visit) => selected.has(visit.id)).map((visit) => visit.id))
    )
  }

  async function submit(formData: FormData): Promise<void> {
    setRefusal(null)

    try {
      const result = await createInvoice(null, formData)
      if (result.success) {
        setHasCreated(true)
        toast.success('Draft created')
        router.push(`${INVOICES_PATH}/${result.data.id}`)
        return
      }

      const isStale = STALE_VISIT_CODES.includes(result.code)
      if (isStale) {
        router.refresh()
      }
      setRefusal(isStale ? `${result.error} The list is updated. Check the visits and try again.` : result.error)
    } catch (thrown) {
      // A network or server failure: keep the admin's checks, date and notes.
      console.error('createInvoice failed', thrown)
      setRefusal(UNKNOWN_MESSAGE)
    }
  }

  const [, formAction, isPending] = useActionState(async (_previous: null, formData: FormData) => {
    await submit(formData)
    return null
  }, null)

  // While a client switch loads, the previous client's visits are still here; the summary reads as empty.
  const chosen = useMemo(
    () => (isSwitching ? [] : visits.filter((visit) => selected.has(visit.id))),
    [isSwitching, visits, selected]
  )
  const totalCents = draftTotalCents(chosen.map((visit) => ({ line: { billed_amount_cents: null, cancelled_at: null }, visit })))
  const unpricedCount = chosen.filter((visit) => claimableStates(visit).includes('unpriced')).length
  const totalLabel = formatCents(totalCents)
  const hasClient = pickedId !== ''
  const isLocked = isPending || hasCreated

  // Checked before the action starts: once it is pending the fieldset locks and can't take focus.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pickedId) return

    event.preventDefault()
    setClientError(true)
    document.getElementById(CLIENT_FIELD_ID)?.focus()
  }

  function handleClientChange(nextId: string) {
    if (nextId === pickedId) return

    setRefusal(null)
    setClientError(false)

    setPickedId(nextId)
    startSwitch(() => {
      router.replace(`${NEW_INVOICE_PATH}?client=${nextId}`, { scroll: false })
    })
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <fieldset disabled={isLocked} className="contents">
        <div className="min-w-0 space-y-6">
          <Field data-invalid={clientError || undefined}>
            <FieldLabel htmlFor={CLIENT_FIELD_ID}>Client</FieldLabel>
            <SearchableSelect
              id={CLIENT_FIELD_ID}
              options={clients.map((client) => ({ value: client.id, label: clientLabel(client) }))}
              value={pickedId}
              onValueChange={handleClientChange}
              placeholder="Pick a client"
              searchPlaceholder="Search clients"
              emptyMessage="No client matches."
              aria-invalid={clientError && !hasClient}
              aria-describedby={clientError && !hasClient ? CLIENT_ERROR_ID : undefined}
            />
            {clientError && !hasClient ? <FieldError id={CLIENT_ERROR_ID}>Pick a client.</FieldError> : null}
            <FieldDescription>Only clients with visits to bill are listed.</FieldDescription>
          </Field>

          {isClientUnavailable && !hasClient ? (
            <Alert className="animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart">
              <Info aria-hidden="true" />
              <AlertTitle>Nothing to bill for that client</AlertTitle>
              <AlertDescription>Their visits are all on an invoice or cancelled. Pick another client.</AlertDescription>
            </Alert>
          ) : null}

          {hasClient ? (
            <ClaimableVisitList
              visits={visits}
              selected={selected}
              onSelectedChange={setSelected}
              businessDate={businessDate}
              disabled={isLocked}
              isLoading={isSwitching}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Pick a client to see their visits.
            </p>
          )}
        </div>

        {/* On phones this wrapper dissolves so the action bar can stick against the whole form; from lg it is the Summary card. */}
        <aside className="contents lg:sticky lg:top-8 lg:flex lg:flex-col lg:gap-4 lg:self-start lg:rounded-lg lg:bg-card lg:p-5 lg:ring-1 lg:ring-foreground/10">
          <div className="hidden space-y-2 lg:block">
            <h2 className="text-lg font-semibold tracking-tight">Summary</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Visits</dt>
                <dd className="tabular-nums">{chosen.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Total at Live price</dt>
                <dd className="min-w-[8ch] text-right text-base font-semibold tabular-nums">{totalLabel}</dd>
              </div>
            </dl>
            <UnpricedNote count={unpricedCount} />
          </div>

          <Card className="p-4 sm:p-5 lg:gap-4 lg:bg-transparent lg:p-0 lg:ring-0">
            <h2 className="text-lg font-semibold tracking-tight lg:sr-only">Details</h2>
            <Field>
              <FieldLabel htmlFor="due_date">
                Due date <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                min={businessDate}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <FieldDescription>Leave blank and set it when you issue.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                enterKeyHint="done"
                placeholder="e.g. October deep cleans"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="scroll-mb-32"
              />
            </Field>
          </Card>

          <div className="sticky bottom-0 z-30 -mx-6 space-y-2 border-t bg-background/95 px-6 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex items-baseline justify-between gap-3 text-sm lg:hidden">
              <span className="font-medium">{pluralize(chosen.length, 'visit')}</span>
              <span className="min-w-[8ch] text-right font-semibold tabular-nums">{totalLabel}</span>
            </div>
            <UnpricedNote count={unpricedCount} className="lg:hidden" />

            {refusal ? (
              <Alert
                variant="destructive"
                className="animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Couldn&apos;t create the draft</AlertTitle>
                <AlertDescription>{refusal}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end lg:flex-col-reverse">
              <Button
                variant="outline"
                size="lg"
                className="hidden transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] md:inline-flex lg:w-full"
                nativeButton={false}
                render={<Link href={INVOICES_PATH} />}
              >
                Cancel
              </Button>
              <SubmitButton
                label="Create draft"
                pendingLabel="Creating…"
                size="lg"
                className="w-full transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] sm:w-auto lg:w-full"
              />
            </div>
          </div>
        </aside>

        <input type="hidden" name="client_id" value={pickedId} />
        {chosen.map((visit) => (
          <input key={visit.id} type="hidden" name="appointment_ids" value={visit.id} />
        ))}
      </fieldset>
    </form>
  )
}
