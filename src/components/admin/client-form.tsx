'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useInvalidateAppointments } from '@/hooks/use-invalidate-appointments'
import { createClient, type ClientActionResult, updateClient } from '@/lib/actions/clients'

type ClientFormProps = {
  client?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    notes: string | null
    is_active: boolean
  }
}

const initialState: ClientActionResult = {
  success: false,
  error: '',
}

function SubmitButton({ isEditMode }: { isEditMode: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : isEditMode ? 'Save changes' : 'Create client'}
    </Button>
  )
}

export function ClientForm({ client }: ClientFormProps) {
  const serverAction = client ? updateClient.bind(null, client.id) : createClient
  const [state, formAction, _isPending] = useActionState(serverAction, initialState)
  const invalidateAppointments = useInvalidateAppointments()

  // A saved form never gets a result back: the action redirects. So discard at submit, before the
  // action runs; a refused save costs one skeleton. Not prevented, so the action still dispatches.
  function handleSubmit() {
    void invalidateAppointments()
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form action={formAction} onSubmit={handleSubmit} className="space-y-5">
        {'error' in state && state.error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {state.error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Name
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={client?.name ?? ''}
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.name)}
            aria-describedby={'fieldErrors' in state && state.fieldErrors?.name ? 'name-error' : undefined}
            className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="Johnson Family"
          />
          {'fieldErrors' in state && state.fieldErrors?.name ? (
            <p id="name-error" className="text-xs text-red-600">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={client?.email ?? ''}
              aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.email)}
              aria-describedby={'fieldErrors' in state && state.fieldErrors?.email ? 'email-error' : undefined}
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              placeholder="client@example.com"
            />
            {'fieldErrors' in state && state.fieldErrors?.email ? (
              <p id="email-error" className="text-xs text-red-600">
                {state.fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-sm font-medium text-neutral-700">
              Phone
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={client?.phone ?? ''}
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              placeholder="(615) 555-0100"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm font-medium text-neutral-700">
            Notes
          </Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={client?.notes ?? ''}
            className="min-h-28 rounded-xl border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="Preferred arrival windows, gate codes, pets, or special instructions."
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={client?.is_active ?? true}
            className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-neutral-700">Client is active</span>
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href={client ? `/solutions/clients/${client.id}` : '/solutions/clients'}
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton isEditMode={Boolean(client)} />
        </div>
      </form>
    </section>
  )
}