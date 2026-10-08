'use client'

import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useEffect } from 'react'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import SubmitButton from '@/components/ui/submit-button'

export type UpdatePasswordActionState = {
  status: 'editing' | 'invalid-link' | 'updated'
  sessionEstablished: boolean
  error: string | null
  fieldErrors: {
    password?: string
    confirmPassword?: string
  }
}

const initialState: UpdatePasswordActionState = {
  status: 'editing',
  sessionEstablished: false,
  error: null,
  fieldErrors: {},
}

const ALERT_ENTER_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart'

type UpdatePasswordFormProps = {
  code: string | null
  action: (
    previousState: UpdatePasswordActionState,
    formData: FormData
  ) => Promise<UpdatePasswordActionState>
}

export const UpdatePasswordForm = ({ code, action }: UpdatePasswordFormProps) => {
  const [state, formAction] = useActionState(action, initialState)

  useEffect(() => {
    const firstInvalidId = state.fieldErrors.password
      ? 'password'
      : state.fieldErrors.confirmPassword
        ? 'confirmPassword'
        : null
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus()
    }
  }, [state])

  if (!code || state.status === 'invalid-link') {
    return (
      <div className="space-y-4">
        <Alert
          variant="destructive"
          role="alert"
          aria-live="polite"
          className={ALERT_ENTER_CLASSES}
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>
            This password reset link is invalid, expired, or has already been used.
          </AlertTitle>
        </Alert>

        <p className="text-sm leading-6 text-muted-foreground">
          Request a new link and open it in the same browser you requested it
          from.
        </p>

        <Button
          size="lg"
          className="w-full active:scale-[0.98]"
          render={<Link href="/forgot-password" />}
          nativeButton={false}
        >
          Request a new link
        </Button>
      </div>
    )
  }

  if (state.status === 'updated') {
    return (
      <div
        className="animate-in space-y-4 fade-in-0 duration-base ease-out-quart"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Your password has been updated and you are signed in.
        </p>

        <Button
          size="lg"
          className="w-full active:scale-[0.98]"
          render={<Link href="/solutions" />}
          nativeButton={false}
        >
          Continue to the portal
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="code" value={code} />

      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.password)}>
          <FieldLabel htmlFor="password" className="text-sm font-medium">
            New password
          </FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            autoFocus
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
            aria-describedby={
              state.fieldErrors.password ? 'password-error' : undefined
            }
            placeholder="At least 8 characters"
          />
          {state.fieldErrors.password && (
            <FieldError id="password-error" className="text-sm">
              {state.fieldErrors.password}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm new password
          </FieldLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state.fieldErrors.confirmPassword)}
            aria-describedby={
              state.fieldErrors.confirmPassword
                ? 'confirm-password-error'
                : undefined
            }
            placeholder="Re-enter your new password"
          />
          {state.fieldErrors.confirmPassword && (
            <FieldError id="confirm-password-error" className="text-sm">
              {state.fieldErrors.confirmPassword}
            </FieldError>
          )}
        </Field>
      </FieldGroup>

      {state.error ? (
        <Alert
          variant="destructive"
          role="alert"
          aria-live="polite"
          className={`mt-4 ${ALERT_ENTER_CLASSES}`}
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      ) : null}

      <SubmitButton
        label="Update password"
        pendingLabel="Updating..."
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
