'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteEmployee, type EmployeeActionResult } from '@/lib/actions/employees'

const initialState: EmployeeActionResult = {
  success: false,
  error: '',
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Sending...' : 'Send Invite'}
    </Button>
  )
}

export function InviteEmployeeForm() {
  const [state, formAction] = useActionState(inviteEmployee, initialState)

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form action={formAction} className="space-y-5">
        {state.success ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
            role="status"
            aria-live="polite"
          >
            Invite sent to {state.data?.email ?? 'the employee'}! They&apos;ll receive an email to set up
            their account.
          </div>
        ) : null}

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
          <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.email)}
            aria-describedby={'fieldErrors' in state && state.fieldErrors?.email ? 'email-error' : undefined}
            className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="employee@example.com"
          />
          {'fieldErrors' in state && state.fieldErrors?.email ? (
            <p id="email-error" className="text-xs text-red-600">
              {state.fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-sm font-medium text-neutral-700">
            Full Name
          </Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            required
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.full_name)}
            aria-describedby={
              'fieldErrors' in state && state.fieldErrors?.full_name ? 'full-name-error' : undefined
            }
            className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="Alex Johnson"
          />
          {'fieldErrors' in state && state.fieldErrors?.full_name ? (
            <p id="full-name-error" className="text-xs text-red-600">
              {state.fieldErrors.full_name}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-neutral-100 pt-4">
          <SubmitButton />
        </div>
      </form>
    </section>
  )
}