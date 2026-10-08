'use client'

import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import SubmitButton from '@/components/ui/submit-button'

export type LoginActionState = {
  error: string | null
  fieldErrors: {
    email?: string
    password?: string
  }
}

const initialState: LoginActionState = {
  error: null,
  fieldErrors: {},
}

type LoginFormProps = {
  action: (
    previousState: LoginActionState,
    formData: FormData
  ) => Promise<LoginActionState>
}

export function LoginForm({ action }: LoginFormProps) {
  const [state, formAction] = useActionState(action, initialState)
  // Controlled so a failed submit does not wipe the email (React resets uncontrolled inputs); never the password.
  const [email, setEmail] = useState('')

  useEffect(() => {
    const firstInvalidId = state.fieldErrors.email
      ? 'email'
      : state.fieldErrors.password
        ? 'password'
        : null
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus()
    }
  }, [state])

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

        <Field data-invalid={Boolean(state.fieldErrors.password)}>
          <FieldLabel htmlFor="password" className="text-sm font-medium">
            Password
          </FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
            aria-describedby={state.fieldErrors.password ? 'password-error' : undefined}
            placeholder="Enter your password"
          />
          {state.fieldErrors.password && (
            <FieldError id="password-error" className="text-sm">
              {state.fieldErrors.password}
            </FieldError>
          )}
        </Field>
      </FieldGroup>

      <div className="-my-1 flex justify-end">
        <Link
          href="/forgot-password"
          className="-mx-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-primary transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:text-primary/70 md:hover:text-primary/80 md:hover:underline md:hover:underline-offset-4"
        >
          Forgot password?
        </Link>
      </div>

      {state.error ? (
        <Alert
          variant="destructive"
          role="alert"
          aria-live="polite"
          className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}

      <SubmitButton
        label="Sign in"
        pendingLabel="Signing in..."
        size="lg"
        className="mt-6 w-full active:scale-[0.98]"
      />

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Need access? Contact your operations lead.
      </p>
    </form>
  )
}
