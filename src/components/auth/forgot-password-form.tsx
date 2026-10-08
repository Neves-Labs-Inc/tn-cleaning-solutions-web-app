'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'

export type ForgotPasswordActionState = {
  success: boolean
  fieldErrors: {
    email?: string
  }
}

const initialState: ForgotPasswordActionState = {
  success: false,
  fieldErrors: {},
}

type ForgotPasswordFormProps = {
  action: (
    previousState: ForgotPasswordActionState,
    formData: FormData
  ) => Promise<ForgotPasswordActionState>
}

export const ForgotPasswordForm = ({ action }: ForgotPasswordFormProps) => {
  const [state, formAction] = useActionState(action, initialState)
  // Controlled so a failed submit does not wipe the typed email (React resets uncontrolled inputs).
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (state.fieldErrors.email) {
      document.getElementById('email')?.focus()
    }
  }, [state])

  if (state.success) {
    return (
      <div
        className="animate-in space-y-4 fade-in-0 duration-base ease-out-quart"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          If an account exists for that email address, a password reset link
          is on its way.
        </p>
        <Button
          size="lg"
          className="w-full active:scale-[0.98]"
          render={<Link href="/login" />}
          nativeButton={false}
        >
          Back to login
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.email)}>
          <FieldLabel htmlFor="email" className="text-sm font-medium">
            Email
          </FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="next"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors.email)}
            aria-describedby={state.fieldErrors.email ? 'email-error' : undefined}
            placeholder="admin@tncleaningsolutions.com"
          />
          {state.fieldErrors.email && (
            <FieldError id="email-error" className="text-sm">
              {state.fieldErrors.email}
            </FieldError>
          )}
        </Field>
      </FieldGroup>

      <SubmitButton
        label="Send reset link"
        pendingLabel="Sending..."
        size="lg"
        className="mt-6 w-full active:scale-[0.98]"
      />

      <p className="mt-2 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="-mx-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-primary transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:text-primary/70 md:hover:text-primary/80 md:hover:underline md:hover:underline-offset-4"
        >
          Back to login
        </Link>
      </p>
    </form>
  )
}
