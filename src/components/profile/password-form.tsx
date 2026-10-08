'use client'

import { AlertCircle } from 'lucide-react'
import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import SubmitButton from '@/components/ui/submit-button'

import { type ActionState, updatePassword } from '@/lib/actions/profile'

const initialState: ActionState = {}
const NEW_PASSWORD_ID = 'new_password'
const CONFIRM_PASSWORD_ID = 'confirm_password'

// Server message -> id of the input to focus.
const ERROR_FIELD: Record<string, string> = {
  'Password is required': NEW_PASSWORD_ID,
  'Password must be at least 8 characters': NEW_PASSWORD_ID,
  'Passwords do not match': CONFIRM_PASSWORD_ID,
}

export function PasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const invalidFieldId = state.error ? ERROR_FIELD[state.error] : undefined

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
      toast.success('Password updated')
    }
    if (invalidFieldId) {
      document.getElementById(invalidFieldId)?.focus()
    }
  }, [state, invalidFieldId])

  return (
    <Card className="sm:py-5">
      <CardHeader className="sm:px-5">
        <CardTitle className="text-lg font-semibold tracking-tight">Change password</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          At least 8 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="sm:px-5">
        <form ref={formRef} action={formAction} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={NEW_PASSWORD_ID} className="text-sm">
                New password
              </FieldLabel>
              <PasswordInput
                id={NEW_PASSWORD_ID}
                name="new_password"
                autoComplete="new-password"
                required
                minLength={8}
                aria-invalid={invalidFieldId === NEW_PASSWORD_ID}
                className="scroll-mb-24"
                placeholder="At least 8 characters"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={CONFIRM_PASSWORD_ID} className="text-sm">
                Confirm password
              </FieldLabel>
              <PasswordInput
                id={CONFIRM_PASSWORD_ID}
                name="confirm_password"
                autoComplete="new-password"
                required
                aria-invalid={invalidFieldId === CONFIRM_PASSWORD_ID}
                className="scroll-mb-24"
                placeholder="Re-enter the new password"
              />
            </Field>
          </FieldGroup>

          {state.error ? (
            <Alert
              variant="destructive"
              className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
            >
              <AlertCircle aria-hidden="true" />
              <AlertTitle className="text-sm">{state.error}</AlertTitle>
            </Alert>
          ) : null}

          <SubmitButton label="Change password" pendingLabel="Updating…" className="mt-6 w-full" />
        </form>
      </CardContent>
    </Card>
  )
}
